import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { ApiError, assertSameOrigin, jsonError, positiveNumber, readJson } from "@/lib/http";
import { recalculateDailyRecord } from "@/lib/nutrition";

async function ownedItem(client: import("@/lib/db").PrismaQueryClient, id: number, userId: number, includeDeleted=false) {
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
    const body=await readJson<{quantity?:number;restore?:boolean}>(request);
    await transaction(async client=>{
      const item=await ownedItem(client,id,user.id,Boolean(body.restore));
      if(body.restore){
        await client.query("update fitfuel.meal_item set deleted_at=null,updated_at=now() where id=$1",[id]);
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
