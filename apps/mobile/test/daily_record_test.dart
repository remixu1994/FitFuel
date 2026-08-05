import 'package:flutter_test/flutter_test.dart';
import 'package:fitfuel_mobile/shared/models/daily_record.dart';

void main() {
  test('parses daily record meals and nutrition snapshots', () {
    final record = DailyRecord.fromJson({
      'profile': {'meal_count': 4},
      'water': 500,
      'meals': [
        {
          'type': 'meal_1',
          'name': '第 1 餐',
          'items': [
            {
              'id': 42,
              'name': '牛奶（全脂）',
              'quantity': 220,
              'unit': 'ml',
              'gramWeight': 220,
              'calories': 134,
              'protein': 7.3,
              'carbohydrate': 9.5,
              'fat': 7,
              'dietaryFiber': 0.2,
            }
          ],
        }
      ],
    });

    expect(record.profile?['meal_count'], 4);
    expect(record.water, 500);
    expect(record.meals.single.type, 'meal_1');
    expect(record.meals.single.items.single.id, 42);
    expect(record.meals.single.items.single.gramWeight, 220);
    expect(record.meals.single.items.single.calories, 134);
    expect(record.meals.single.items.single.protein, 7.3);
    expect(record.meals.single.items.single.carbohydrate, 9.5);
    expect(record.meals.single.items.single.fat, 7);
    expect(record.meals.single.items.single.dietaryFiber, 0.2);
  });
}
