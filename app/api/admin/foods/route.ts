import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db, numbers, transaction } from "@/lib/db";
import { ApiError, assertSameOrigin, jsonError, positiveNumber, readJson } from "@/lib/http";

type FoodBody={id?:number;name?:string;serving?:string;gramWeight?:number;calories?:number;protein?:number;carbohydrate?:number;fat?:number;dietaryFiber?:number};
function parse(body:FoodBody){
  const name=String(body.name??"").trim();
  if(!name) throw new ApiError(400,"请输入食品名称");
  return {name,serving:String(body.serving??"100g"),gramWeight:positiveNumber(body.gramWeight??100,"克重"),calories:positiveNumber(body.calories??0,"热量",true),protein:positiveNumber(body.protein??0,"蛋白质",true),carbohydrate:positiveNumber(body.carbohydrate??0,"碳水",true),fat:positiveNumber(body.fat??0,"脂肪",true),dietaryFiber:positiveNumber(body.dietaryFiber??0,"膳食纤维",true)};
}
export async function GET(request:Request){
  try{
    await requireAdmin();const q=(new URL(request.url).searchParams.get("q")??"").trim();
    const result=await db.query(`select f.id,f.name,coalesce(s.serving_name,n.unit,'100g') serving,coalesce(s.gram_weight,100) gram_weight,coalesce(n.calories,0) calories,coalesce(n.protein,0) protein,coalesce(n.carbohydrate,0) carbohydrate,coalesce(n.fat,0) fat,coalesce(n.dietary_fiber,0) dietary_fiber from food_info.food f left join lateral (select * from food_info.food_nutrition where food_id=f.id order by id limit 1) n on true left join lateral (select * from food_info.food_serving where food_id=f.id order by is_default desc,id limit 1) s on true where f.status=1 and ($1='' or f.name ilike '%'||$1||'%') order by f.updated_at desc nulls last,f.id desc limit 100`,[q]);
    return NextResponse.json({foods:result.rows.map(numbers)});
  }catch(error){return jsonError(error);}
}
export async function POST(request:Request){
  try{
    assertSameOrigin(request);const admin=await requireAdmin();const body=await readJson<FoodBody>(request);const food=parse(body);
    const result=await transaction(async client=>{
      const existing=await client.query(`select id from food_info.food where status=1 and (($1::int is not null and id=$1) or lower(name)=lower($2)) limit 1`,[body.id??null,food.name]);
      let id:number;
      if(existing.rowCount){id=Number(existing.rows[0].id);await client.query(`insert into food_info.food_nutrition(food_id,unit,calories,protein,fat,carbohydrate,dietary_fiber) values($1,$2,$3,$4,$5,$6,$7) on conflict(food_id,unit) do update set calories=excluded.calories,protein=excluded.protein,fat=excluded.fat,carbohydrate=excluded.carbohydrate,dietary_fiber=excluded.dietary_fiber`,[id,food.serving,food.calories,food.protein,food.fat,food.carbohydrate,food.dietaryFiber]);await client.query(`update food_info.food_serving set serving_name=$2,gram_weight=$3 where food_id=$1 and is_default=1`,[id,food.serving,food.gramWeight]);}
      else {let category=await client.query(`select id from food_info.food_category where name='AI 补充' limit 1`);if(!category.rowCount)category=await client.query(`insert into food_info.food_category(parent_id,name,sort_order) values(0,'AI 补充',999) returning id`);const inserted=await client.query(`insert into food_info.food(name,category_id,description,status) values($1,$2,'由食品详情图录入',1) returning id`,[food.name,category.rows[0].id]);id=Number(inserted.rows[0].id);await client.query(`insert into food_info.food_nutrition(food_id,unit,calories,protein,fat,carbohydrate,dietary_fiber) values($1,$2,$3,$4,$5,$6,$7)`,[id,food.serving,food.calories,food.protein,food.fat,food.carbohydrate,food.dietaryFiber]);await client.query(`insert into food_info.food_serving(food_id,serving_name,gram_weight,unit_type,is_default) values($1,$2,$3,'g',1)`,[id,food.serving,food.gramWeight]);}
      await client.query(`insert into fitfuel.food_catalog_audit(food_id,action,query,model,confidence,raw_candidate,final_values,actor_user_id) values($1,'manual_update',null,'mimo-vision',null,null,$2::jsonb,$3)`,[id,food,admin.id]);return id;
    });
    return NextResponse.json({id:result},{status:201});
  }catch(error){return jsonError(error);}
}
