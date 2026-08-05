import 'package:flutter/material.dart';
import '../../app/theme.dart';
import '../../core/widgets/app_page.dart';

class RecordsPage extends StatelessWidget {
  const RecordsPage({super.key});
  @override
  Widget build(BuildContext context) => AppPage(eyebrow: 'Food journal', title: '饮食记录', actions: [IconButton(onPressed: () {}, icon: const Icon(Icons.search))], child: Column(children: [
    Row(children: [ChoiceChip(label: const Text('7天'), selected: true, onSelected: (_) {}), const SizedBox(width: 8), ChoiceChip(label: const Text('30天'), selected: false, onSelected: (_) {}), const SizedBox(width: 8), ChoiceChip(label: const Text('90天'), selected: false, onSelected: (_) {})]),
    const SizedBox(height: 18), const SurfaceSection(child: Row(children: [MetricTile(label: '有摄入记录', value: '0', unit: ' / 7天'), MetricTile(label: '日均摄入', value: '0', unit: 'kcal', color: FitFuelColors.orange), MetricTile(label: '已记录餐次', value: '0', unit: '餐', color: FitFuelColors.purple)])),
    const SizedBox(height: 18), for (final day in ['今天 · 8月4日', '8月3日 · 周一', '8月2日 · 周日', '8月1日 · 周六']) Padding(padding: const EdgeInsets.only(bottom: 10), child: SurfaceSection(child: Row(children: [Text(day, style: const TextStyle(fontWeight: FontWeight.w800)), const Spacer(), const Text('未记录', style: TextStyle(color: FitFuelColors.muted, fontSize: 12)), const Icon(Icons.chevron_right, color: FitFuelColors.muted)])))
  ]));
}
