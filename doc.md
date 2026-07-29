# 1. 产品定位

## 产品名称

FitFuel

## 产品定位

> 一个基于 AI 的个人营养记录与饮食管理 App。

帮助用户：

1. 快速记录每日饮食
2. 自动计算营养摄入
3. 根据目标调整饮食方案


目标用户：

- 健身人群
- 减脂人群
- 增肌人群
- 健康管理用户

---

# 2. 核心功能

## 功能架构

```
FitFuel

├── 今日饮食
│
├── 食物库
│
├── AI识别
│
├── 营养分析
│
├── 目标管理
│
└── 用户中心
```

---

# 3. 今日饮食页面

对应你的第一张图。

## 页面目标

展示：

> 今天吃了什么，还差多少营养目标。


---

## 页面结构


```
--------------------------------

2026-07-28


今日目标

🔥 1784 kcal

━━━━━━━━━━

碳水
120 / 202 g


蛋白质
80 / 109 g


脂肪
30 / 60 g


--------------------------------


早餐

+ 添加食物


--------------------------------


午餐

+ 添加食物


--------------------------------


晚餐

+ 添加食物


--------------------------------


加餐

+ 添加食物


--------------------------------

饮水量

2000 ml


--------------------------------
```


---

# 4. 餐饮模型设计

默认：

```
Meal
 |
 |-- Breakfast
 |
 |-- Lunch
 |
 |-- Dinner
 |
 |-- Snack
```


支持用户自定义：

例如：

```
训练前餐
训练后餐
下午茶
夜宵
```


---

# 5. 食物添加流程

对应第二张图。


点击：

```
早餐
  +
    ↓

选择食品
```


进入：

```
添加食品页面


搜索框

请输入想搜索的食物


--------------------------------

最近添加

鸡胸肉

米饭

香蕉


--------------------------------


AI识别

📷


--------------------------------

创建食品

+
```


---

# 6. 食物数据库设计


## Food 表


```
Food

id

name

category


nutrition

calorie

protein

carbohydrate

fat


source

system
user
AI

```


例如：


|食品|热量|蛋白|碳水|脂肪|
|-|-:|-:|-:|-:|
|鸡胸肉100g|165|31|0|3.6|
|米饭100g|116|2.6|25.9|0.3|
|鸡蛋1个|70|6|0.5|5|

---

# 7. AI 食物查询


这是你的核心差异点。


传统 App：

```
用户搜索

鸡胸肉

↓

数据库匹配

↓

返回
```

---

FitFuel：

```
用户输入：

"晚上吃了一份黄焖鸡米饭"


↓

AI理解

↓

拆解:

鸡肉
米饭
油
酱料


↓

估算:

热量
蛋白质
碳水
脂肪


↓

用户确认


↓

保存
```

---

# AI 能力


## 1. 文本识别

输入：

> 两个鸡蛋，一杯牛奶，50g燕麦


输出：

```json
[
{
 food:"鸡蛋",
 quantity:2,
 calories:140
},

{
 food:"牛奶",
 quantity:"250ml",
 calories:150
}
]
```


---

## 2. 图片识别


未来：

拍照：

```
照片

↓

Vision Model

↓

识别:

米饭
牛肉
蔬菜

↓

估算重量

↓

营养计算
```


---

# 8. 营养目标系统


用户设置：

```
目标:

○ 减脂

○ 增肌

○ 维持


身体:

年龄
性别
身高
体重


训练:

每周训练次数


```


系统计算：

```
TDEE

↓

目标热量

↓

Macro比例

↓

每日目标
```


例如：

你的情况：

```
男
175cm
77kg

力量训练5次/周

目标减脂


Calories:

1800 kcal


Protein:

110g


Carb:

200g


Fat:

60g

```

---

# 9. Web + Mobile 技术方案


## 总体架构


```
                


          API Gateway


              |

--------------------------------

          Backend


       .NET 8 Web API


--------------------------------


 PostgreSQL

      |

 Food Database


--------------------------------


 AI Service


 BGE-M3
 LLM
 Vision Model


--------------------------------


Flutter App

Web App


```

---

# 10. 前端方案


## Mobile

Flutter


原因：

- Android
- iOS
- 一套代码

技术：

```
Flutter

Riverpod
GoRouter
Dio

SQLite

```


---

## Web


推荐：

React + TypeScript

或者：

Flutter Web


我的建议：

```
Mobile:
Flutter


Web:
React

```

原因：

饮食管理 Web 更多是：

- 数据分析
- 图表
- 周/月报


React 生态更强。

---

# 11. Backend


推荐：

.NET 8


结构：

```
FitFuel.Api


FitFuel.Application


FitFuel.Domain


FitFuel.Infrastructure

```


DDD：

```
User

NutritionGoal

Food

Meal

MealItem

DailyRecord

AIRecognition

```

---

# 12. 数据模型


## User

```
Id

Weight

Height

Age

Gender

Goal

```


---

## DailyRecord


```
Id

UserId

Date


Calories

Protein

Carb

Fat

```


---

## Meal


```
Id

DailyRecordId

Type


Breakfast

Lunch

Dinner

```


---

## MealItem


```
MealId


FoodId


Quantity


NutritionSnapshot

```

为什么保存 Snapshot？

因为：

食品数据库可能变化。


例如：

以前：

鸡胸肉：

165 kcal


以后：

更新：

170 kcal


历史记录不能变。


---

# 13. AI + RAG 架构


结合你的 FitAtlas 思路：

```
Food Knowledge Base


        |

Embedding


        |

Vector DB

(Qdrant)


        |

AI Assistant


```


支持：

用户问：

> 我今天蛋白质还差30g，晚饭吃什么？

AI：

查询：

- 当前摄入
- 用户目标
- 食物库


生成建议。


---

# 14. V1 开发范围（建议）


不要一开始做 AI。

第一版：

## MVP


必须：

✅ 用户登录

✅ 设置目标

✅ 今日饮食

✅ 食物搜索

✅ 添加食品

✅ 自动计算 Macro


---

第二阶段：

加入：

✅ AI 食物识别

✅ AI 饮食建议

✅ 图片识别


---

第三阶段：

加入：

✅ FitAtlas训练数据融合

例如：

```
今天:

胸训练

消耗500kcal


AI:

训练后推荐:

蛋白40g
碳水80g

```


---

# 15. 项目目录建议

```
FitFuel


/backend

    FitFuel.Api

    FitFuel.Domain

    FitFuel.Infrastructure


/mobile

    fitfuel_flutter


/web

    fitfuel_web


/ai

    food-ai-service


/database

    migrations

/docs

```

---

# 最终定位

FitFuel 不应该成为 MyFitnessPal 的复制品。

差异点应该是：

> **AI + 健身场景 + 个性化营养规划**

结合你已经设计的 FitAtlas：

未来可以形成：

```
              Fitness AI Platform


                


        FitAtlas        FitFuel

       训练知识        饮食管理


              \        /

                AI Coach

```

这个方向和你之前做 RAG 基础库的技术路线是高度匹配的。你可以先把 FitFuel 做成一个独立 Flutter + .NET 项目，后续接入 FitAtlas 的知识库。