import 'package:flutter/material.dart';

import '../../app/theme.dart';

class AppPage extends StatelessWidget {
  const AppPage({required this.eyebrow, required this.title, required this.child, this.actions, super.key});
  final String eyebrow;
  final String title;
  final Widget child;
  final List<Widget>? actions;

  @override
  Widget build(BuildContext context) => SafeArea(
        child: CustomScrollView(slivers: [
          SliverAppBar(
            pinned: true,
            titleSpacing: 20,
            title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(eyebrow.toUpperCase(), style: const TextStyle(fontSize: 9, letterSpacing: 1.5, color: FitFuelColors.green, fontWeight: FontWeight.w800)),
              Text(title, style: const TextStyle(fontSize: 23, color: FitFuelColors.ink, fontWeight: FontWeight.w800)),
            ]),
            actions: actions,
          ),
          SliverPadding(padding: const EdgeInsets.fromLTRB(18, 12, 18, 26), sliver: SliverToBoxAdapter(child: child)),
        ]),
      );
}

class SurfaceSection extends StatelessWidget {
  const SurfaceSection({required this.child, this.padding = const EdgeInsets.all(16), super.key});
  final Widget child;
  final EdgeInsets padding;
  @override
  Widget build(BuildContext context) => Container(width: double.infinity, padding: padding, decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), border: Border.all(color: FitFuelColors.line)), child: child);
}

class MetricTile extends StatelessWidget {
  const MetricTile({required this.label, required this.value, required this.unit, this.color = FitFuelColors.green, super.key});
  final String label;
  final String value;
  final String unit;
  final Color color;
  @override
  Widget build(BuildContext context) => Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Container(width: 30, height: 30, decoration: BoxDecoration(color: color.withValues(alpha: .12), borderRadius: BorderRadius.circular(10)), child: Icon(Icons.show_chart, size: 16, color: color)), const SizedBox(height: 10), Text(label, style: const TextStyle(fontSize: 11, color: FitFuelColors.muted)), const SizedBox(height: 3), Text.rich(TextSpan(text: value, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: FitFuelColors.ink), children: [TextSpan(text: ' $unit', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w500))]))]));
}
