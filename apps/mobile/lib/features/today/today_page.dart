import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../app/app.dart';
import '../../app/theme.dart';
import '../../core/widgets/app_page.dart';
import '../../shared/models/daily_record.dart';

class TodayPage extends ConsumerStatefulWidget {
  const TodayPage({super.key});
  @override
  ConsumerState<TodayPage> createState() => _TodayPageState();
}
class _TodayPageState extends ConsumerState<TodayPage> {
  late String date;
  Future<DailyRecord>? request;
  @override
  void initState() { super.initState(); date = DateFormat('yyyy-MM-dd').format(DateTime.now()); request = _load(); }
  Future<DailyRecord> _load() async { final response = await ref.read(apiClientProvider).get<Map<String, dynamic>>('/api/daily-records/$date'); return DailyRecord.fromJson(response.data ?? const {}); }
  void shift(int days) { final next = DateTime.parse(date).add(Duration(days: days)); setState(() { date = DateFormat('yyyy-MM-dd').format(next); request = _load(); }); }
  @override
  Widget build(BuildContext context) => AppPage(
        eyebrow: 'Daily nutrition', title: '今日饮食',
        actions: [IconButton(onPressed: () => setState(() => request = _load()), icon: const Icon(Icons.refresh))],
        child: FutureBuilder<DailyRecord>(future: request, builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) return const Center(child: Padding(padding: EdgeInsets.all(48), child: CircularProgressIndicator()));
          if (snapshot.hasError) return _ErrorState(onRetry: () => setState(() => request = _load()));
          final data = snapshot.data!; final record = data.record ?? const <String, dynamic>{}; final goal = data.goal ?? const <String, dynamic>{};
          return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [IconButton(onPressed: () => shift(-1), icon: const Icon(Icons.chevron_left)), Expanded(child: Center(child: Text(date, style: const TextStyle(fontWeight: FontWeight.w700)))), IconButton(onPressed: () => shift(1), icon: const Icon(Icons.chevron_right))]),
            const SizedBox(height: 10),
            SurfaceSection(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('营养目标进度', style: TextStyle(fontWeight: FontWeight.w800)), const SizedBox(height: 18),
              Row(children: [MetricTile(label: '热量', value: _number(record['calories_consumed']).toStringAsFixed(0), unit: '/ ${_number(goal['calories_kcal']).toStringAsFixed(0)} kcal', color: FitFuelColors.orange), MetricTile(label: '碳水', value: _number(record['elevatine_carbohydrate']).toStringAsFixed(1), unit: '/ ${_number(goal['carbohydrate_g']).toStringAsFixed(0)} g', color: FitFuelColors.blue), MetricTile(label: '蛋白质', value: _number(record['elevatine_protein']).toStringAsFixed(1), unit: '/ ${_number(goal['protein_g']).toStringAsFixed(0)} g', color: FitFuelColors.green), MetricTile(label: '脂肪', value: _number(record['elevatine_fat']).toStringAsFixed(1), unit: '/ ${_number(goal['fat_g']).toStringAsFixed(0)} g', color: FitFuelColors.yellow)]),
            ])), const SizedBox(height: 14),
            ...data.meals.map((meal) => Padding(padding: const EdgeInsets.only(bottom: 10), child: SurfaceSection(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [const Icon(Icons.restaurant_outlined, color: FitFuelColors.green), const SizedBox(width: 10), Expanded(child: Text(meal.name, style: const TextStyle(fontWeight: FontWeight.w800))), if (meal.source == 'elevatine') const Text('Elavatine 同步', style: TextStyle(fontSize: 11, color: FitFuelColors.muted))]), const Divider(height: 20),
              if (meal.items.isEmpty) const Text('暂无食品', style: TextStyle(color: FitFuelColors.muted)) else ...meal.items.map((item) => Padding(padding: const EdgeInsets.symmetric(vertical: 5), child: Row(children: [Expanded(child: Text('${item.name}\n${item.quantity} ${item.unit}', style: const TextStyle(height: 1.4))), Text('${item.calories.toStringAsFixed(0)} kcal', style: const TextStyle(fontWeight: FontWeight.w700))]))),
            ])))),
            SurfaceSection(child: Row(children: [const Icon(Icons.water_drop_outlined, color: FitFuelColors.blue), const SizedBox(width: 10), Expanded(child: Text('饮水量\n${data.water.toStringAsFixed(0)} / ${_number(goal['water_ml']).toStringAsFixed(0)} ml', style: const TextStyle(fontWeight: FontWeight.w700, height: 1.5))), OutlinedButton(onPressed: () {}, child: const Text('记录饮水'))])),
          ]);
        }),
      );
  double _number(dynamic value) => value is num ? value.toDouble() : double.tryParse('$value') ?? 0;
}
class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.onRetry}); final VoidCallback onRetry;
  @override Widget build(BuildContext context) => Center(child: Column(mainAxisSize: MainAxisSize.min, children: [const Icon(Icons.cloud_off, color: FitFuelColors.muted), const SizedBox(height: 8), const Text('暂时无法加载数据'), TextButton(onPressed: onRetry, child: const Text('重试'))]));
}
