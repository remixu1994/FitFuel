import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../app/app.dart';
import '../../app/theme.dart';
import '../../core/widgets/app_page.dart';

class ActivityPage extends ConsumerStatefulWidget {
  const ActivityPage({super.key});

  @override
  ConsumerState<ActivityPage> createState() => _ActivityPageState();
}

class _ActivityPageState extends ConsumerState<ActivityPage> {
  String range = '30d';
  bool loading = true;
  String? error;
  Map<String, dynamic> data = const {};

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
        '/api/coros/activities',
        query: {'range': range},
      );
      if (!mounted) return;
      setState(() => data = response.data ?? const {});
    } on DioException catch (exception) {
      final body = exception.response?.data;
      if (mounted) setState(() => error = body is Map && body['error'] != null ? '${body['error']}' : '运动数据加载失败');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  void _changeRange(String value) {
    if (range == value) return;
    setState(() => range = value);
    _load();
  }

  Future<void> _editActivity([Map<String, dynamic>? existing]) async {
    var selectedDate = DateTime.tryParse('${existing?['date'] ?? ''}') ?? DateTime.now();
    final controller = TextEditingController(
      text: existing == null ? '' : _number(existing['activityCalories']).toStringAsFixed(0),
    );
    final result = await showDialog<_ActivityInput>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('录入每日活动消耗'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('日期'),
                subtitle: Text(DateFormat('yyyy-MM-dd').format(selectedDate)),
                trailing: const Icon(Icons.calendar_month_outlined),
                onTap: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: selectedDate,
                    firstDate: DateTime(2020),
                    lastDate: DateTime(2035),
                  );
                  if (picked != null) setDialogState(() => selectedDate = picked);
                },
              ),
              TextField(
                controller: controller,
                autofocus: true,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Active Calories', suffixText: 'kcal'),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('取消')),
            FilledButton(
              onPressed: () {
                final calories = double.tryParse(controller.text);
                if (calories != null && calories >= 0) {
                  Navigator.pop(context, _ActivityInput(DateFormat('yyyy-MM-dd').format(selectedDate), calories));
                }
              },
              child: const Text('保存'),
            ),
          ],
        ),
      ),
    );
    controller.dispose();
    if (result == null) return;
    try {
      await ref.read(apiClientProvider).patch<Map<String, dynamic>>(
        '/api/daily-records/${result.date}/activity',
        data: {'activityCalories': result.calories},
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('活动消耗已更新')));
      _load();
    } on DioException catch (exception) {
      if (!mounted) return;
      final body = exception.response?.data;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(body is Map && body['error'] != null ? '${body['error']}' : '活动消耗保存失败'), backgroundColor: Colors.red.shade700),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final energy = (data['energy'] as Map?)?.cast<String, dynamic>() ?? const {};
    final totals = (energy['totals'] as Map?)?.cast<String, dynamic>() ?? const {};
    final averages = (energy['averages'] as Map?)?.cast<String, dynamic>() ?? const {};
    final calendar = (data['calendar'] as Map?)?.cast<String, dynamic>() ?? const {};
    final calendarDays = ((calendar['days'] as List?) ?? const [])
        .whereType<Map>()
        .map((item) => item.cast<String, dynamic>())
        .toList();
    return AppPage(
      eyebrow: 'Sport activity',
      title: '运动消耗',
      actions: [
        IconButton(onPressed: _load, icon: const Icon(Icons.refresh)),
        IconButton(onPressed: () => _editActivity(), icon: const Icon(Icons.add)),
      ],
      child: Column(
        children: [
          Wrap(
            spacing: 8,
            children: [
              for (final item in const {'7d': '7天', '30d': '30天', '90d': '90天', '2026': '2026年'}.entries)
                ChoiceChip(label: Text(item.value), selected: range == item.key, onSelected: (_) => _changeRange(item.key)),
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
                  MetricTile(label: '周期活动消耗', value: _number(totals['activeCalories']).round().toString(), unit: 'kcal'),
                  MetricTile(label: '记录天数', value: '${energy['recordedDays'] ?? 0}', unit: '天', color: FitFuelColors.blue),
                  MetricTile(label: '平均每日', value: _number(averages['activeCalories']).round().toString(), unit: 'kcal', color: FitFuelColors.orange),
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
                      const Expanded(child: Text('每日 Active Calories', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17))),
                      Text('${calendar['month'] ?? ''}', style: const TextStyle(color: FitFuelColors.muted)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  if (calendarDays.isEmpty)
                    const Padding(padding: EdgeInsets.symmetric(vertical: 24), child: Center(child: Text('当前月份暂无活动记录', style: TextStyle(color: FitFuelColors.muted))))
                  else
                    ...calendarDays.reversed.map(
                      (day) => InkWell(
                        onTap: () => _editActivity(day),
                        borderRadius: BorderRadius.circular(10),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 9),
                          child: Row(
                            children: [
                              const Icon(Icons.local_fire_department_outlined, size: 18, color: FitFuelColors.green),
                              const SizedBox(width: 10),
                              Expanded(child: Text('${day['date'] ?? ''}')),
                              Text('${_number(day['activityCalories']).toStringAsFixed(0)} kcal', style: const TextStyle(fontWeight: FontWeight.w800)),
                              const SizedBox(width: 4),
                              const Icon(Icons.edit_outlined, size: 16, color: FitFuelColors.muted),
                            ],
                          ),
                        ),
                      ),
                    ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(onPressed: () => _editActivity(), icon: const Icon(Icons.edit_outlined), label: const Text('手动录入每日消耗')),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            SurfaceSection(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('个人能量指标', style: TextStyle(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 14),
                  _EnergyRow(label: 'BMR', value: averages['bmr']),
                  _EnergyRow(label: 'TEF', value: averages['tef']),
                  _EnergyRow(label: 'TDEE', value: averages['tdee']),
                  _EnergyRow(label: '热量差', value: averages['deficit']),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  double _number(dynamic value) =>
      value is num ? value.toDouble() : double.tryParse('$value') ?? 0;
}

class _EnergyRow extends StatelessWidget {
  const _EnergyRow({required this.label, required this.value});

  final String label;
  final dynamic value;

  @override
  Widget build(BuildContext context) {
    final number = value is num ? value.toDouble() : double.tryParse('$value') ?? 0;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(child: Text(label, style: const TextStyle(color: FitFuelColors.muted))),
          Text('${number.toStringAsFixed(0)} kcal', style: const TextStyle(fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

class _ActivityInput {
  const _ActivityInput(this.date, this.calories);

  final String date;
  final double calories;
}
