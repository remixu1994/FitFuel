下面按照你的实际减脂记录需求，设计一个 **个人减脂数据分析 Web 系统设计文档（V1.0）**。

目标不是做一个简单的热量记录工具，而是建立一个**基于真实数据反馈的个人 TDEE（每日总消耗）模型系统**。

---

# 减脂数据追踪 Web 系统设计文档

## 1. 项目概述

## 1.1 项目名称

**FatTrack - Personal Cutting Analytics System**

（可改名）

---

## 1.2 项目目标

开发一个个人减脂数据管理 Web 应用，实现：

1. 每日快速记录：

* 日期（自动生成）
* 体重
* 摄入热量
* 活动消耗（来自 Apple Watch / Garmin 等）

2. 自动计算：

* 基础代谢
* 食物热效应
* 每日总消耗
* 热量差
* 理论脂肪变化
* 周/月趋势

3. 根据历史数据：

* 分析真实减脂速度
* 校准个人消耗模型
* 预测达到目标体重时间

---

# 2. 核心业务流程

## 用户每日输入

用户只需要填写：

```
日期
体重
摄入热量
活动消耗
```

例如：

| 日期         |   体重 |   摄入 | 活动消耗 |
| ---------- | ---: | ---: | ---: |
| 2026-07-27 | 77.5 | 2200 |  900 |

系统自动生成：

| 指标     |        结果 |
| ------ | --------: |
| 基础代谢   | 1715 kcal |
| 食物热效应  |  176 kcal |
| 总消耗    | 2790 kcal |
| 热量差    |  590 kcal |
| 预计脂肪变化 |   0.077kg |

---

# 3. 用户基础信息模型

## UserProfile

保存用户长期不变信息。

| 字段            | 说明   | 示例     |
| ------------- | ---- | ------ |
| Height        | 身高   | 175 cm |
| Age           | 年龄   | 32     |
| Gender        | 性别   | Male   |
| TargetWeight  | 目标体重 | 73kg   |
| InitialWeight | 初始体重 | 79.9kg |

---

# 4. 每日数据模型

## DailyRecord

数据库表：

```
DailyRecord
```

| 字段               | 类型      | 说明    |
| ---------------- | ------- | ----- |
| Id               | int     | 主键    |
| Date             | date    | 日期    |
| Weight           | decimal | 当天体重  |
| CaloriesConsumed | int     | 摄入热量  |
| ActivityCalories | int     | 活动消耗  |
| BMR              | decimal | 基础代谢  |
| TEF              | decimal | 食物热效应 |
| TDEE             | decimal | 总消耗   |
| CalorieBalance   | decimal | 热量差   |

---

# 5. 消耗计算模型

---

# 5.1 基础代谢 BMR

采用：

## Mifflin-St Jeor 方程

男性：

[
BMR =
10 \times weight
+
6.25 \times height
------------------

5 \times age
+
5
]

你的参数：

```
weight = 当日体重
height =175
age=32
```

实际：

[
BMR =
10\times体重
+
1093.75
-------

160
+
5
]

简化：

[
\boxed{
BMR=10\times体重+938.75
}
]

例如：

体重：

77.5kg

计算：

[
77.5\times10+938.75
]

=

1713.75 kcal

---

# 5.2 食物热效应 TEF

## 当前模型

采用：

[
\boxed{
TEF=摄入热量\times8%
}
]

例如：

摄入：

2200 kcal

则：

[
TEF=2200\times0.08
]

=

176 kcal

---

## 后续增强版本

支持按照营养素计算：

输入：

```
Protein(g)
Carbohydrate(g)
Fat(g)
```

公式：

### 蛋白质

[
Protein\times4\times25%
]

### 碳水

[
Carb\times4\times7.5%
]

### 脂肪

[
Fat\times9\times2%
]

最终：

[
TEF=
P_{TEF}
+
C_{TEF}
+
F_{TEF}
]

---

# 5.3 每日总消耗 TDEE

当前模型：

[
\boxed{
TDEE=
BMR+
ActivityCalories+
TEF
}
]

例如：

```
BMR =1715

Activity=900

TEF=176
```

那么：

[
TDEE=2791
]

---

# 5.4 热量差

公式：

[
\boxed{
CalorieDeficit=TDEE-CalorieIntake
}
]

例如：

```
TDEE=2791

摄入=2200
```

结果：

[
591 kcal
]

---

# 5.5 理论脂肪变化

采用：

[
7700 kcal≈1kg脂肪
]

每日：

[
FatLoss=
\frac{CalorieDeficit}{7700}
]

例如：

591 kcal：

[
591/7700
]

=

0.077kg

---

# 6. 周统计模型

系统自动生成：

## WeeklySummary

字段：

| 指标     | 计算         |
| ------ | ---------- |
| 平均摄入   | sum / days |
| 平均活动消耗 | sum / days |
| 平均TDEE | sum / days |
| 平均热量差  | sum / days |
| 理论脂肪下降 | 热量差/7700   |
| 实际体重变化 | 周初-周末      |

例如：

7.20-7.26

输出：

```
摄入:
2090 kcal/day


活动:
849 kcal/day


TDEE:
2733 kcal/day


热量差:
642 kcal/day


理论下降:
0.58kg


实际:
77.5 → 77.6
```

---

# 7. 目标预测模型

## 输入

目标：

```
当前体重:
77.6

目标:
73

剩余:
4.6kg
```

---

## 根据历史平均速度预测

过去 N 周：

平均每日热量差：

例如：

650 kcal

每日脂肪下降：

[
650/7700
]

=

0.084kg/day

每周：

[
0.59kg/week
]

剩余时间：

[
4.6/0.59
]

=

7.8周

输出：

```
预计达到目标:

2026-09-20
```

---

# 8. 数据分析 Dashboard

首页：

## 当前状态

```
当前体重

77.6 kg


目标体重

73 kg


剩余

4.6 kg


预计完成

9月中旬
```

---

## 趋势图

### 体重曲线

X:

日期

Y:

体重

显示：

* 原始体重
* 7日平均体重

---

### 热量趋势

显示：

```
摄入
TDEE
热量差
```

---

### 减脂速度

显示：

```
Week1  -0.6kg
Week2  -0.5kg
Week3  -0.6kg
```

---

# 9. 个人模型校准

这是系统区别普通 App 的核心。

## 问题

理论计算：

[
TDEE
]

不一定准确。

因此增加：

## Adaptive TDEE Model

通过真实体重变化反推：

实际消耗：

[
ActualTDEE
==========

AverageCalories
+
\frac{WeightLoss\times7700}{Days}
]

例如：

28天：

摄入：

2150

下降：

2kg

那么：

[
2150+
\frac{2\times7700}{28}
]

=

2700 kcal

系统显示：

```
理论TDEE:
2800

实际TDEE:
2700

偏差:
-100 kcal
```

---

# 10. 技术架构建议

## 前端

推荐：

* React
* Next.js
* Tailwind CSS
* ECharts

功能：

* Dashboard
* 数据录入
* 图表


---

## 数据库

PostgreSQL

表：

```
UserProfile

DailyRecord

WeeklySummary

WeightTrend

TargetPlan
```

---

# 11. MVP 第一版本范围

第一阶段：

只实现：

✅ 用户信息配置

✅ 每日数据录入

✅ 自动计算：

* BMR
* TEF
* TDEE
* 热量差

✅ 周统计

✅ 体重趋势图

---

第二阶段：

增加：

* 营养素计算 TEF
* 自动预测目标日期
* TDEE动态校准
* 数据导入 Excel

---

第三阶段：

AI分析：

例如：

> 为什么本周热量差650 kcal，但是体重没有下降？

AI 自动分析：

* 水分
* 糖原
* 训练量
* 摄入变化
* 恢复状态

---

# 12. 当前你的个人模型默认参数

系统初始化：

```
Height:
175cm

Age:
32

Gender:
Male


BMR:
Mifflin-St Jeor


TEF:
8%


Activity:
用户输入


Fat Conversion:
7700 kcal/kg


目标:
73kg
```

---

这个项目实际上非常适合做成一个**个人减脂数据闭环系统**：

输入：

> 吃多少 + 动多少 + 体重变化

模型：

> 计算消耗

反馈：

> 校准真实TDEE

最终得到：

> 属于你自己的减脂公式

比普通健身 App 的“固定热量推荐”更准确。
