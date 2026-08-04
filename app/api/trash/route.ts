import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth";
import { db, numbers } from "@/server/db";
import { ApiError, assertSameOrigin, jsonError, positiveNumber, readJson } from "@/server/http";
export const dynamic = "force-dynamic";

export async function GET(){
  try{
    const user=await requireUser();
    const [foods,items,records,water]=await Promise.all([
      db.query("select id,name,deleted_at from fitfuel.custom_food where user_id=$1 and deleted_at is not null order by deleted_at desc",[user.id]),
      db.query(
        `select mi.id,mi.food_name_snapshot name,mi.deleted_at
         from fitfuel.meal_item mi join fitfuel.meal m on m.id=mi.meal_id
         join fitfuel.daily_record d on d.id=m.daily_record_id
         where d.user_id=$1 and mi.deleted_at is not null order by mi.deleted_at desc`,[user.id]),
      db.query("select id,record_date::text name,deleted_at from fitfuel.daily_record where user_id=$1 and deleted_at is not null order by deleted_at desc",[user.id]),
      db.query("select id,amount_ml::text || ' ml' name,deleted_at from fitfuel.water_log where user_id=$1 and deleted_at is not null order by deleted_at desc",[user.id])
    ]);
    return NextResponse.json({items:[
      ...foods.rows.map(row=>({...numbers(row),type:"custom_food"})),
      ...items.rows.map(row=>({...numbers(row),type:"meal_item"})),
      ...records.rows.map(row=>({...numbers(row),type:"daily_record"})),
      ...water.rows.map(row=>({...numbers(row),type:"water"}))
    ]});
  }catch(error){return jsonError(error);}
}

export async function POST(request:Request){
  try{
    assertSameOrigin(request);
    const user=await requireUser();
    const body=await readJson<{id?:number;type?:string}>(request);
    const id=positiveNumber(body.id,"记录 ID");
    const map:Record<string,string>={
      custom_food:"update fitfuel.custom_food set deleted_at=null,updated_at=now() where id=$1 and user_id=$2",
      daily_record:"update fitfuel.daily_record set deleted_at=null,updated_at=now() where id=$1 and user_id=$2",
      water:"update fitfuel.water_log set deleted_at=null where id=$1 and user_id=$2"
    };
    if(body.type==="meal_item"){
      const result=await db.query(
        `update fitfuel.meal_item mi set deleted_at=null,updated_at=now()
         from fitfuel.meal m,fitfuel.daily_record d
         where mi.id=$1 and m.id=mi.meal_id and d.id=m.daily_record_id and d.user_id=$2`,[id,user.id]
      );
      if(!result.rowCount) throw new ApiError(404,"记录不存在");
    }else{
      const sql=map[String(body.type)];
      if(!sql) throw new ApiError(400,"记录类型无效");
      const result=await db.query(sql,[id,user.id]);
      if(!result.rowCount) throw new ApiError(404,"记录不存在");
    }
    return NextResponse.json({ok:true});
  }catch(error){return jsonError(error);}
}
