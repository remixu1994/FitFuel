import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth";
import { db, numbers, transaction } from "@/server/db";
import { ApiError, assertSameOrigin, jsonError, positiveNumber, readJson } from "@/server/http";

type FoodBody={id?:number;name?:string;serving?:string;unit?:string;quantity?:number;gramWeight?:number;gram_weight?:number;calories?:number;protein?:number;carbohydrate?:number;fat?:number;dietaryFiber?:number;dietary_fiber?:number};
function parse(body:FoodBody){
  const name=String(body.name??"").trim();
  if(!name) throw new ApiError(400,"请输入食品名称");
  const serving=String(body.serving??"100g").trim() || "100g";
  const unit=String(body.unit??(serving.match(/[a-zA-Z]+$/)?.[0]||"g")).trim().toLowerCase() || "g";
  const sourceQuantity=positiveNumber(body.quantity ?? Number(serving.match(/^\s*([\d.]+)/)?.[1] ?? 100),"数量",false);
  const sourceGramWeight=positiveNumber(body.gramWeight ?? body.gram_weight ?? sourceQuantity,"克重");
  const factor=sourceQuantity>0 ? 100/sourceQuantity : 1;
  const normalize=(value:number|undefined,allowZero=true)=>Math.round(positiveNumber(value??0,"营养值",allowZero)*factor*100)/100;
  return {name,serving:unit==="g"&&sourceQuantity!==100?"100g":serving,unit,gramWeight:unit==="g"?100:Math.round(sourceGramWeight*factor*100)/100,calories:normalize(body.calories),protein:normalize(body.protein),carbohydrate:normalize(body.carbohydrate),fat:normalize(body.fat),dietaryFiber:normalize(body.dietaryFiber ?? body.dietary_fiber)};
}
export async function GET(request:Request){
  try{
    await requireAdmin();const q=(new URL(request.url).searchParams.get("q")??"").trim();
    const result=await db.query(`select f.id,f.name,case when lower(coalesce(s.unit_type,'g')) in ('ml','毫升') then '100ml' else '100g' end serving,coalesce(s.gram_weight,100) gram_weight,coalesce(n.calories,0) calories,coalesce(n.protein,0) protein,coalesce(n.carbohydrate,0) carbohydrate,coalesce(n.fat,0) fat,coalesce(n.dietary_fiber,0) dietary_fiber from food_info.food f left join lateral (select * from food_info.food_nutrition where food_id=f.id order by id limit 1) n on true left join lateral (select * from food_info.food_serving where food_id=f.id order by is_default desc,id limit 1) s on true where f.status=1 and ($1='' or f.name ilike '%'||$1||'%') order by f.updated_at desc nulls last,f.id desc limit 100`,[q]);
    const foods=result.rows.map(numbers).map((food:any)=>{
      const grams=Number(food.gram_weight)||100;
      const isGram=!String(food.serving).toLowerCase().includes("ml");
      const factor=isGram&&grams>0?100/grams:1;
      const scale=(value:number)=>Math.round(Number(value||0)*factor*100)/100;
      return {...food,gram_weight:isGram?100:grams,calories:scale(food.calories),protein:scale(food.protein),carbohydrate:scale(food.carbohydrate),fat:scale(food.fat),dietary_fiber:scale(food.dietary_fiber)};
    });
    return NextResponse.json({foods});
  }catch(error){return jsonError(error);}
}
export async function POST(request:Request){
  try{
    assertSameOrigin(request);const admin=await requireAdmin();const body=await readJson<FoodBody>(request);const food=parse(body);
    const result=await transaction(async client=>{
      const existing=await client.query(`select id from food_info.food where status=1 and (($1::int is not null and id=$1) or lower(name)=lower($2)) limit 1`,[body.id??null,food.name]);
      let id:number;
      if(existing.rowCount){id=Number(existing.rows[0].id);await client.query(`insert into food_info.food_nutrition(food_id,unit,calories,protein,fat,carbohydrate,dietary_fiber) values($1,$2,$3,$4,$5,$6,$7) on conflict(food_id,unit) do update set calories=excluded.calories,protein=excluded.protein,fat=excluded.fat,carbohydrate=excluded.carbohydrate,dietary_fiber=excluded.dietary_fiber`,[id,food.unit,food.calories,food.protein,food.fat,food.carbohydrate,food.dietaryFiber]);await client.query(`update food_info.food_serving set serving_name=$2,gram_weight=$3,unit_type=$4 where food_id=$1 and is_default=1`,[id,food.serving,food.gramWeight,food.unit]);}
      else {let category=await client.query(`select id from food_info.food_category where name='AI è¡¥å……' limit 1`);if(!category.rowCount)category=await client.query(`insert into food_info.food_category(parent_id,name,sort_order) values(0,'AI è¡¥å……',999) returning id`);const inserted=await client.query(`insert into food_info.food(name,category_id,description,status) values($1,$2,'ç”±é£Ÿå“è¯¦æƒ…å›¾å½•å…¥',1) returning id`,[food.name,category.rows[0].id]);id=Number(inserted.rows[0].id);await client.query(`insert into food_info.food_nutrition(food_id,unit,calories,protein,fat,carbohydrate,dietary_fiber) values($1,$2,$3,$4,$5,$6,$7)`,[id,food.unit,food.calories,food.protein,food.fat,food.carbohydrate,food.dietaryFiber]);await client.query(`insert into food_info.food_serving(food_id,serving_name,gram_weight,unit_type,is_default) values($1,$2,$3,$4,1)`,[id,food.serving,food.gramWeight,food.unit]);}
      await client.query(`insert into fitfuel.food_catalog_audit(food_id,action,query,model,confidence,raw_candidate,final_values,actor_user_id) values($1,'manual_update',null,'mimo-vision',null,null,$2::jsonb,$3)`,[id,food,admin.id]);return id;
    });
    return NextResponse.json({id:result},{status:201});
  }catch(error){return jsonError(error);}
}
