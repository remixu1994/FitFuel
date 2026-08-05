import 'package:flutter/material.dart';
import '../../app/theme.dart';
import '../../core/widgets/app_page.dart';

class ActivityPage extends StatelessWidget {
  const ActivityPage({super.key});
  @override
  Widget build(BuildContext context) => AppPage(eyebrow: 'Sport activity', title: '运动消耗', actions: [FilledButton.icon(onPressed: () {}, icon: const Icon(Icons.sync, size: 16), label: const Text('同步 COROS'))], child: Column(children: [
    const SurfaceSection(child: Row(children: [MetricTile(label: '周期活动消耗', value: '0', unit: 'kcal'), MetricTile(label: '活动天数', value: '0', unit: '天', color: FitFuelColors.blue), MetricTile(label: '平均每日', value: '0', unit: 'kcal', color: FitFuelColors.orange)])),
    const SizedBox(height: 14),
    SurfaceSection(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const Text('每日 Active Calories', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17)), const SizedBox(height: 16), Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [for (final item in ['7/29','7/30','7/31','8/1','8/2','8/3','8/4']) Column(children: [Container(height: item == '8/4' ? 72 : 34, width: 20, decoration: BoxDecoration(color: item == '8/4' ? FitFuelColors.green : FitFuelColors.green.withValues(alpha: .2), borderRadius: BorderRadius.circular(5))), const SizedBox(height: 6), Text(item, style: const TextStyle(fontSize: 9, color: FitFuelColors.muted))])]), const SizedBox(height: 20), OutlinedButton.icon(onPressed: () {}, icon: const Icon(Icons.edit_outlined), label: const Text('手动录入今日消耗'))])),
    const SizedBox(height: 14),
    const SurfaceSection(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('个人能量指标', style: TextStyle(fontWeight: FontWeight.w800)), SizedBox(height: 14), Text('BMR     — kcal'), Text('TEF     — kcal'), Text('TDEE    — kcal'), Text('热量差  — kcal')]))
  ]));
}
