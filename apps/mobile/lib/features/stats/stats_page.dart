import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/app.dart';
import '../../app/theme.dart';
import '../../core/widgets/app_page.dart';

class StatsPage extends ConsumerStatefulWidget {
  const StatsPage({super.key});

  @override
  ConsumerState<StatsPage> createState() => _StatsPageState();
}

class _StatsPageState extends ConsumerState<StatsPage> {
  int days = 30;
  bool loading = true;
  String? error;
  Map<String, dynamic> summary = const {};
  List<Map<String, dynamic>> records = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final response = await ref.read(apiClientProvider).get<Map<String, dynamic>>(
        '/api/stats',
        query: {'range': '${days}d'},
      );
      if (!mounted) return;
      setState(() {
        summary = (response.data?['summary'] as Map?)?.cast<String, dynamic>() ?? const {};
        records = ((response.data?['records'] as List?) ?? const [])
            .whereType<Map>()
            .map((item) => item.cast<String, dynamic>())
            .toList();
      });
    } on DioException catch (exception) {
      final data = exception.response?.data;
      if (mounted) {
        setState(() => error = data is Map && data['error'] != null ? '${data['error']}' : '统计数据加载失败');
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  void _changeRange(int value) {
    if (days == value) return;
    setState(() => days = value);
    _load();
  }

  @override
  Widget build(BuildContext context) => AppPage(
        eyebrow: 'Progress analytics',
        title: '营养统计',
        actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))],
        child: Column(
          children: [
            Wrap(
              spacing: 8,
              children: [
                for (final value in const [7, 30, 90])
                  ChoiceChip(
                    label: Text('$value天'),
                    selected: days == value,
                    onSelected: (_) => _changeRange(value),
                  ),
              ],
            ),
            const SizedBox(height: 14),
            if (loading)
              const Padding(padding: EdgeInsets.all(48), child: CircularProgressIndicator())
            else if (error != null)
              SurfaceSection(
                child: Column(
                  children: [
                    Text(error!, style: TextStyle(color: Colors.red.shade700)),
                    TextButton(onPressed: _load, child: const Text('重试')),
                  ],
                ),
              )
            else ...[
              SurfaceSection(
                child: Row(
                  children: [
                    MetricTile(label: '平均摄入', value: _number(summary['averageIntake']).round().toString(), unit: 'kcal', color: FitFuelColors.orange),
                    MetricTile(label: '平均活动', value: _number(summary['averageActivity']).round().toString(), unit: 'kcal', color: FitFuelColors.blue),
                    MetricTile(label: '平均 TDEE', value: _number(summary['averageTdee']).round().toString(), unit: 'kcal'),
                    MetricTile(label: '热量差', value: _number(summary['averageBalance']).round().toString(), unit: 'kcal', color: FitFuelColors.purple),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              SurfaceSection(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Expanded(child: Text('周期概览', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17))),
                        Text('${summary['periodStart'] ?? ''} — ${summary['periodEnd'] ?? ''}', style: const TextStyle(fontSize: 11, color: FitFuelColors.muted)),
                      ],
                    ),
                    const SizedBox(height: 14),
                    _SummaryRow(label: '当前体重', value: '${_display(summary['currentWeight'])} kg'),
                    _SummaryRow(label: '目标体重', value: '${_display(summary['targetWeight'])} kg'),
                    _SummaryRow(label: '周期活动消耗', value: '${_number(summary['periodActivityTotal']).round()} kcal'),
                    _SummaryRow(label: '周期 TDEE', value: '${_number(summary['periodTdee']).round()} kcal'),
                    _SummaryRow(label: '周期热量差', value: '${_number(summary['periodBalance']).round()} kcal'),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              SurfaceSection(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('最近记录', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
                    const SizedBox(height: 10),
                    if (records.isEmpty)
                      const Padding(padding: EdgeInsets.symmetric(vertical: 24), child: Center(child: Text('当前周期暂无数据', style: TextStyle(color: FitFuelColors.muted))))
                    else
                      ...records.reversed.take(10).map(
                        (record) => Padding(
                          padding: const EdgeInsets.symmetric(vertical: 7),
                          child: Row(
                            children: [
                              Expanded(child: Text(_date(record['record_date']))),
                              Text('${_number(record['calories_consumed']).round()} kcal', style: const TextStyle(fontWeight: FontWeight.w700)),
                              const SizedBox(width: 14),
                              SizedBox(width: 62, child: Text('${_display(record['weight_kg'])} kg', textAlign: TextAlign.end, style: const TextStyle(color: FitFuelColors.muted))),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ],
        ),
      );

  double _number(dynamic value) =>
      value is num ? value.toDouble() : double.tryParse('$value') ?? 0;

  String _display(dynamic value) {
    if (value == null) return '—';
    final number = _number(value);
    return number == 0 ? '—' : number.toStringAsFixed(1);
  }

  String _date(dynamic value) {
    final text = '$value';
    return text.length >= 10 ? text.substring(0, 10) : text;
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            Expanded(child: Text(label, style: const TextStyle(color: FitFuelColors.muted))),
            Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
          ],
        ),
      );
}
