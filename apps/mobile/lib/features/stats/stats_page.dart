import 'package:flutter/material.dart';
import '../../app/theme.dart';
import '../../core/widgets/app_page.dart';

class StatsPage extends StatelessWidget {
  const StatsPage({super.key});
  @override
  Widget build(BuildContext context) => AppPage(eyebrow: 'Progress analytics', title: '营养统计', actions: [IconButton(onPressed: () {}, icon: const Icon(Icons.file_download_outlined))], child: Column(children: [
    const SurfaceSection(child: Row(children: [MetricTile(label: '平均摄入', value: '0', unit: 'kcal', color: FitFuelColors.orange), MetricTile(label: '平均活动', value: '0', unit: 'kcal', color: FitFuelColors.blue), MetricTile(label: '平均 TDEE', value: '0', unit: 'kcal'), MetricTile(label: '热量差', value: '0', unit: 'kcal', color: FitFuelColors.purple)])),
    const SizedBox(height: 14),
    SurfaceSection(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const Text('2026年8月', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17)), const SizedBox(height: 14), const CalendarGrid()])),
    const SizedBox(height: 14),
    const SurfaceSection(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('体重趋势', style: TextStyle(fontWeight: FontWeight.w800)), SizedBox(height: 28), Center(child: Text('录入体重后显示趋势图', style: TextStyle(color: FitFuelColors.muted))), SizedBox(height: 28)])),
  ]));
}
class CalendarGrid extends StatelessWidget {
  const CalendarGrid({super.key});
  @override
  Widget build(BuildContext context) => GridView.count(shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), crossAxisCount: 7, childAspectRatio: .8, children: [for (final day in ['一','二','三','四','五','六','日']) Center(child: Text(day, style: const TextStyle(color: FitFuelColors.muted, fontSize: 11))), for (var i = 1; i <= 31; i++) Column(children: [Text('$i', style: TextStyle(fontWeight: i == 4 ? FontWeight.w800 : FontWeight.w500, color: i == 4 ? FitFuelColors.green : FitFuelColors.ink)), const SizedBox(height: 5), Container(height: 4, width: 22, decoration: BoxDecoration(color: i == 4 ? FitFuelColors.green : FitFuelColors.line, borderRadius: BorderRadius.circular(4)))])]);
}
