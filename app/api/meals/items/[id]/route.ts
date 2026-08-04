import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { transaction } from "@/server/db";
import { ApiError, assertSameOrigin, jsonError, positiveNumber, readJson } from "@/server/http";
import { recalculateDailyRecord } from "@/server/services/nutrition";
export const dynamic = "force-dynamic";

async function ownedItem(client: import("@/server/db").PrismaQueryClient, id: number, userId: number, includeDeleted=false) {
  const result = await client.query(
    `select mi.*,m.daily_record_id from fitfuel.meal_item mi
     join fitfuel.meal m on m.id=mi.meal_id
     join fitfuel.daily_record d on d.id=m.daily_record_id
     where mi.id=$1 and d.user_id=$2 and ($3::boolean or mi.deleted_at is null) for update`,
    [id,userId,includeDeleted]
  );
  if (!result.rowCount) throw new ApiError(404,"餐食记录不存在");
  return result.rows[0];
}

export async function PATCH(request: Request, context:{params:Promise<{id:string}>}) {
  try {
    assertSameOrigin(request);
    const user=await requireUser();
    const id=positiveNumber((await context.params).id,"记录 ID");
    const body=await readJson<{
      quantity?:number;restore?:boolean;name?:string;unit?:string;gramWeight?:number|null;
      calories?:number;protein?:number;carbohydrate?:number;fat?:number;
      dietaryFiber?:number;
    }>(request);
    await transaction(async client=>{
      const item=await ownedItem(client,id,user.id,Boolean(body.restore));
      if(body.restore){
        await client.query("update fitfuel.meal_item set deleted_at=null,updated_at=now() where id=$1",[id]);
      }else if(body.name!==undefined||body.calories!==undefined){
        const name=String(body.name??"").trim();
        const unit=String(body.unit??"").trim();
        if(!name||name.length>200)throw new ApiError(400,"食品名称无效");
        if(!unit||unit.length>32)throw new ApiError(400,"单位无效");
        const quantity=positiveNumber(body.quantity,"数量");
        const gramWeight=body.gramWeight==null?null:positiveNumber(body.gramWeight,"克重");
        const calories=positiveNumber(body.calories,"热量",true);
        const protein=positiveNumber(body.protein??0,"蛋白质",true);
        const carbohydrate=positiveNumber(body.carbohydrate??0,"碳水",true);
        const fat=positiveNumber(body.fat??0,"脂肪",true);
        const dietaryFiber=positiveNumber(body.dietaryFiber??0,"膳食纤维",true);
        await client.query(
          `update fitfuel.meal_item set food_name_snapshot=$2,quantity=$3,unit=$4,
           gram_weight=$5,calories_snapshot=$6,protein_snapshot=$7,
           carbohydrate_snapshot=$8,fat_snapshot=$9,dietary_fiber_snapshot=$10,
           updated_at=now() where id=$1`,
          [id,name,quantity,unit,gramWeight,calories,protein,carbohydrate,fat,dietaryFiber]
        );
      }else{
        const quantity=positiveNumber(body.quantity,"数量");
        const ratio=quantity/Number(item.quantity);
        await client.query(
          `update fitfuel.meal_item set quantity=$2,gram_weight=gram_weight*$3,
           calories_snapshot=calories_snapshot*$3,protein_snapshot=protein_snapshot*$3,
           carbohydrate_snapshot=carbohydrate_snapshot*$3,fat_snapshot=fat_snapshot*$3,
           dietary_fiber_snapshot=dietary_fiber_snapshot*$3,updated_at=now() where id=$1`,
          [id,quantity,ratio]
        );
      }
      await recalculateDailyRecord(client,Number(item.daily_record_id));
    });
    return NextResponse.json({ok:true});
  } catch(error){return jsonError(error);}
}

export async function DELETE(request:Request,context:{params:Promise<{id:string}>}) {
  try{
    assertSameOrigin(request);
    const user=await requireUser();
    const id=positiveNumber((await context.params).id,"记录 ID");
    await transaction(async client=>{
      const item=await ownedItem(client,id,user.id);
      await client.query("update fitfuel.meal_item set deleted_at=now(),updated_at=now() where id=$1",[id]);
      await recalculateDailyRecord(client,Number(item.daily_record_id));
    });
    return NextResponse.json({ok:true});
  }catch(error){return jsonError(error);}
}
