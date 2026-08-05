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
    water: json['water'] as num? ?? 0,
  );
}

class Meal {
  const Meal({required this.name, required this.items, this.source});
  final String name;
  final String? source;
  final List<MealItem> items;
  factory Meal.fromJson(Map<String, dynamic> json) => Meal(
    name: '${json['name'] ?? json['displayName'] ?? '餐次'}',
    source: json['source'] as String?,
    items: ((json['items'] as List?) ?? const [])
        .whereType<Map>()
        .map((item) => MealItem.fromJson(item.cast<String, dynamic>()))
        .toList(),
  );
}

class MealItem {
  const MealItem({
    required this.name,
    required this.calories,
    required this.quantity,
    required this.unit,
  });
  final String name;
  final num calories;
  final num quantity;
  final String unit;
  factory MealItem.fromJson(Map<String, dynamic> json) => MealItem(
    name: '${json['name'] ?? json['food_name_snapshot'] ?? '食品'}',
    calories:
        json['calories'] as num? ?? json['calories_snapshot'] as num? ?? 0,
    quantity: json['quantity'] as num? ?? 1,
    unit: '${json['unit'] ?? 'g'}',
  );
}
