import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../app/app.dart';
import '../../app/theme.dart';
import '../../core/widgets/app_page.dart';

class RecordsPage extends ConsumerStatefulWidget {
  const RecordsPage({super.key});

  @override
  ConsumerState<RecordsPage> createState() => _RecordsPageState();
}

class _RecordsPageState extends ConsumerState<RecordsPage> {
  int days = 7;
  bool loading = true;
  String? error;
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
        '/api/records',
        query: {'days': days},
      );
      if (!mounted) return;
      setState(() {
        records = ((response.data?['records'] as List?) ?? const [])
            .whereType<Map>()
            .map((item) => item.cast<String, dynamic>())
            .toList();
      });
    } on DioException catch (exception) {
      if (mounted) setState(() => error = _message(exception));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  void _changeDays(int value) {
    if (value == days) return;
    setState(() => days = value);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final recorded = records.where((day) => _number(day['recordedCalories']) > 0).length;
    final totalCalories = records.fold<double>(0, (sum, day) => sum + _number(day['recordedCalories']));
    final mealCount = records.fold<int>(0, (sum, day) => sum + ((day['meals'] as List?)?.length ?? 0));
    return AppPage(
      eyebrow: 'Food journal',
      title: '饮食记录',
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
                  onSelected: (_) => _changeDays(value),
                ),
            ],
          ),
          const SizedBox(height: 18),
          SurfaceSection(
            child: Row(
              children: [
                MetricTile(label: '有摄入记录', value: '$recorded', unit: '/ $days天'),
                MetricTile(label: '日均摄入', value: recorded == 0 ? '0' : (totalCalories / recorded).round().toString(), unit: 'kcal', color: FitFuelColors.orange),
                MetricTile(label: '已记录餐次', value: '$mealCount', unit: '餐', color: FitFuelColors.purple),
              ],
            ),
          ),
          const SizedBox(height: 18),
          if (loading)
            const Padding(padding: EdgeInsets.all(40), child: CircularProgressIndicator())
          else if (error != null)
            _ErrorCard(message: error!, onRetry: _load)
          else
            ...records.map((day) => _RecordDayCard(day: day)),
        ],
      ),
    );
  }

  double _number(dynamic value) =>
      value is num ? value.toDouble() : double.tryParse('$value') ?? 0;

  String _message(DioException exception) {
    final data = exception.response?.data;
    return data is Map && data['error'] != null ? '${data['error']}' : '饮食记录加载失败';
  }
}

class _RecordDayCard extends StatelessWidget {
  const _RecordDayCard({required this.day});

  final Map<String, dynamic> day;

  @override
  Widget build(BuildContext context) {
    final rawDate = '${day['date'] ?? ''}';
    final dateValue = rawDate.length >= 10 ? rawDate.substring(0, 10) : rawDate;
    final parsed = DateTime.tryParse(dateValue);
    final weekdays = const ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    final label = parsed == null
        ? dateValue
        : '${DateFormat('M月d日').format(parsed)} ${weekdays[parsed.weekday - 1]}';
    final calories = _number(day['recordedCalories']);
    final totals = (day['totals'] as Map?)?.cast<String, dynamic>() ?? const {};
    final meals = ((day['meals'] as List?) ?? const []).whereType<Map>().toList();
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: SurfaceSection(
        padding: EdgeInsets.zero,
        child: ExpansionTile(
          shape: const Border(),
          collapsedShape: const Border(),
          title: Text(label, style: const TextStyle(fontWeight: FontWeight.w800)),
          subtitle: Text(
            calories > 0 ? '${calories.toStringAsFixed(0)} kcal · 碳水 ${_number(totals['carbohydrate']).toStringAsFixed(0)}g · 蛋白质 ${_number(totals['protein']).toStringAsFixed(0)}g' : '未记录',
            style: const TextStyle(fontSize: 12, color: FitFuelColors.muted),
          ),
          children: meals.isEmpty
              ? const [Padding(padding: EdgeInsets.fromLTRB(16, 0, 16, 16), child: Align(alignment: Alignment.centerLeft, child: Text('当天暂无餐食明细', style: TextStyle(color: FitFuelColors.muted))))]
              : meals.map((raw) {
                  final meal = raw.cast<String, dynamic>();
                  final items = ((meal['items'] as List?) ?? const []).whereType<Map>().toList();
                  return Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${meal['name'] ?? '餐次'}', style: const TextStyle(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 5),
                        if (items.isEmpty)
                          const Text('暂无食品', style: TextStyle(color: FitFuelColors.muted, fontSize: 12))
                        else
                          ...items.map((item) => Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Row(
                                  children: [
                                    Expanded(child: Text('${item['name'] ?? '食品'}', style: const TextStyle(fontSize: 13))),
                                    Text('${_number(item['calories']).toStringAsFixed(0)} kcal', style: const TextStyle(fontSize: 12)),
                                  ],
                                ),
                              )),
                      ],
                    ),
                  );
                }).toList(),
        ),
      ),
    );
  }

  double _number(dynamic value) =>
      value is num ? value.toDouble() : double.tryParse('$value') ?? 0;
}

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => SurfaceSection(
        child: Column(
          children: [
            Text(message, style: TextStyle(color: Colors.red.shade700)),
            TextButton(onPressed: onRetry, child: const Text('重试')),
          ],
        ),
      );
}
