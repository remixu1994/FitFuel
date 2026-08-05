class DailyRecord {
  const DailyRecord({
    this.record,
    this.goal,
    this.profile,
    this.meals = const [],
    this.water = 0,
  });

  final Map<String, dynamic>? record;
  final Map<String, dynamic>? goal;
  final Map<String, dynamic>? profile;
  final List<Meal> meals;
  final num water;

  factory DailyRecord.fromJson(Map<String, dynamic> json) => DailyRecord(
        record: (json['record'] as Map?)?.cast<String, dynamic>(),
        goal: (json['goal'] as Map?)?.cast<String, dynamic>(),
        profile: (json['profile'] as Map?)?.cast<String, dynamic>(),
        meals: ((json['meals'] as List?) ?? const [])
            .whereType<Map>()
            .map((item) => Meal.fromJson(item.cast<String, dynamic>()))
            .toList(),
        water: _number(json['water']),
      );
}

class Meal {
  const Meal({
    required this.name,
    required this.type,
    required this.items,
    this.source,
  });

  final String name;
  final String type;
  final String? source;
  final List<MealItem> items;

  factory Meal.fromJson(Map<String, dynamic> json) => Meal(
        name: '${json['name'] ?? json['displayName'] ?? '餐次'}',
        type: '${json['type'] ?? json['meal_type'] ?? 'meal_1'}',
        source: json['source'] as String?,
        items: ((json['items'] as List?) ?? const [])
            .whereType<Map>()
            .map((item) => MealItem.fromJson(item.cast<String, dynamic>()))
            .toList(),
      );
}

class MealItem {
  const MealItem({
    required this.id,
    required this.name,
    required this.calories,
    required this.quantity,
    required this.unit,
    this.gramWeight,
    this.protein = 0,
    this.carbohydrate = 0,
    this.fat = 0,
    this.dietaryFiber = 0,
    this.source,
  });

  final int id;
  final String name;
  final num calories;
  final num quantity;
  final String unit;
  final num? gramWeight;
  final num protein;
  final num carbohydrate;
  final num fat;
  final num dietaryFiber;
  final String? source;

  factory MealItem.fromJson(Map<String, dynamic> json) => MealItem(
        id: _number(json['id']).toInt(),
        name: '${json['name'] ?? json['food_name_snapshot'] ?? '食品'}',
        calories: _number(json['calories'] ?? json['calories_snapshot']),
        quantity: _number(json['quantity'], fallback: 1),
        unit: '${json['unit'] ?? 'g'}',
        gramWeight: json['gramWeight'] == null && json['gram_weight'] == null
            ? null
            : _number(json['gramWeight'] ?? json['gram_weight']),
        protein: _number(json['protein'] ?? json['protein_snapshot']),
        carbohydrate:
            _number(json['carbohydrate'] ?? json['carbohydrate_snapshot']),
        fat: _number(json['fat'] ?? json['fat_snapshot']),
        dietaryFiber:
            _number(json['dietaryFiber'] ?? json['dietary_fiber_snapshot']),
        source: json['source'] as String?,
      );
}

num _number(dynamic value, {num fallback = 0}) {
  if (value is num) return value;
  return num.tryParse('$value') ?? fallback;
}
