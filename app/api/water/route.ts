import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ApiError, assertSameOrigin, jsonError, positiveNumber, readJson } from "@/lib/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson<{ amount?: number; date?: string }>(request);
    const amount = positiveNumber(body.amount, "饮水量");
    const date = body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
    const result = await db.query(
      `insert into fitfuel.water_log(user_id,amount_ml,logged_at)
       values($1,$2,coalesce(($3::date + time '12:00') at time zone 'Asia/Shanghai',now()))
       returning id`,
      [user.id,amount,date]
    );
    return NextResponse.json({id:Number(result.rows[0].id)},{status:201});
  } catch(error){return jsonError(error);}
}

export async function DELETE(request:Request){
  try{
    assertSameOrigin(request);
    const user=await requireUser();
    const {id}=await readJson<{id?:number}>(request);
    const result=await db.query(
      "update fitfuel.water_log set deleted_at=now() where id=$1 and user_id=$2 and deleted_at is null",
      [positiveNumber(id,"记录 ID"),user.id]
    );
    if(!result.rowCount) throw new ApiError(404,"饮水记录不存在");
    return NextResponse.json({ok:true});
  }catch(error){return jsonError(error);}
}
