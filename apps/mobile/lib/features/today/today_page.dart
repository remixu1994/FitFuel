import 'package:dio/dio.dart';
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
  void initState() {
    super.initState();
    date = DateFormat('yyyy-MM-dd').format(DateTime.now());
    request = _load();
  }

  Future<DailyRecord> _load() async {
    final response = await ref
        .read(apiClientProvider)
        .get<Map<String, dynamic>>('/api/daily-records/$date');
    return DailyRecord.fromJson(response.data ?? const {});
  }

  void _reload() => setState(() => request = _load());

  void shift(int days) {
    final next = DateTime.parse(date).add(Duration(days: days));
    setState(() {
      date = DateFormat('yyyy-MM-dd').format(next);
      request = _load();
    });
  }

  Future<void> _recordWater() async {
    final controller = TextEditingController(text: '250');
    final amount = await showDialog<double>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('记录饮水'),
        content: TextField(
          controller: controller,
          autofocus: true,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: const InputDecoration(labelText: '饮水量', suffixText: 'ml'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.pop(context, double.tryParse(controller.text)),
            child: const Text('保存'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (amount == null || amount <= 0) return;
    try {
      await ref.read(apiClientProvider).post<Map<String, dynamic>>(
        '/api/water',
        data: {'amount': amount, 'date': date},
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('已记录 ${amount.toStringAsFixed(0)} ml 饮水')),
      );
      _reload();
    } on DioException catch (error) {
      if (mounted) _showError(_apiMessage(error, '饮水记录失败'));
    }
  }

  Future<void> _openFoodSearch(String mealType, String mealName) async {
    final added = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _FoodSearchSheet(
        date: date,
        mealType: mealType,
        mealName: mealName,
      ),
    );
    if (added == true) _reload();
  }

  Future<void> _openMealItemEditor(MealItem item) async {
    if (item.id <= 0) {
      _showError('该食品记录缺少有效 ID，暂时无法编辑');
      return;
    }
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _MealItemEditor(item: item),
    );
    if (changed == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('餐食记录已更新')),
      );
      _reload();
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.red.shade700),
    );
  }

  @override
  Widget build(BuildContext context) => AppPage(
        eyebrow: 'Daily nutrition',
        title: '今日饮食',
        actions: [
          IconButton(onPressed: _reload, icon: const Icon(Icons.refresh)),
        ],
        child: FutureBuilder<DailyRecord>(
          future: request,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(
                child: Padding(
                  padding: EdgeInsets.all(48),
                  child: CircularProgressIndicator(),
                ),
              );
            }
            if (snapshot.hasError) return _ErrorState(onRetry: _reload);
            final data = snapshot.data!;
            final record = data.record ?? const <String, dynamic>{};
            final goal = data.goal ?? const <String, dynamic>{};
            final profile = data.profile ?? const <String, dynamic>{};
            final requestedMealCount = _number(profile['meal_count']).toInt();
            final configuredMeals = (requestedMealCount > 0 ? requestedMealCount : 3).clamp(1, 8);
            final mealsByType = {for (final meal in data.meals) meal.type: meal};
            final meals = List.generate(configuredMeals, (index) {
              final type = 'meal_${index + 1}';
              return mealsByType[type] ??
                  Meal(name: '第 ${index + 1} 餐', type: type, items: const []);
            });
            final items = meals.expand((meal) => meal.items);
            final usesElevatineMacros = record['macro_source'] == 'elevatine';
            final carbohydrate = usesElevatineMacros
                ? _number(record['elevatine_carbohydrate'])
                : items.fold<double>(0, (sum, item) => sum + item.carbohydrate.toDouble());
            final protein = usesElevatineMacros
                ? _number(record['elevatine_protein'])
                : items.fold<double>(0, (sum, item) => sum + item.protein.toDouble());
            final fat = usesElevatineMacros
                ? _number(record['elevatine_fat'])
                : items.fold<double>(0, (sum, item) => sum + item.fat.toDouble());
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    IconButton(onPressed: () => shift(-1), icon: const Icon(Icons.chevron_left)),
                    Expanded(
                      child: Center(
                        child: Text(date, style: const TextStyle(fontWeight: FontWeight.w700)),
                      ),
                    ),
                    IconButton(onPressed: () => shift(1), icon: const Icon(Icons.chevron_right)),
                  ],
                ),
                const SizedBox(height: 10),
                SurfaceSection(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('营养目标进度', style: TextStyle(fontWeight: FontWeight.w800)),
                      const SizedBox(height: 18),
                      Row(
                        children: [
                          MetricTile(label: '热量', value: _number(record['calories_consumed']).toStringAsFixed(0), unit: '/ ${_number(goal['calories_kcal']).toStringAsFixed(0)} kcal', color: FitFuelColors.orange),
                          MetricTile(label: '碳水', value: carbohydrate.toStringAsFixed(1), unit: '/ ${_number(goal['carbohydrate_g']).toStringAsFixed(0)} g', color: FitFuelColors.blue),
                          MetricTile(label: '蛋白质', value: protein.toStringAsFixed(1), unit: '/ ${_number(goal['protein_g']).toStringAsFixed(0)} g', color: FitFuelColors.green),
                          MetricTile(label: '脂肪', value: fat.toStringAsFixed(1), unit: '/ ${_number(goal['fat_g']).toStringAsFixed(0)} g', color: FitFuelColors.yellow),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                ...meals.map(
                  (meal) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: SurfaceSection(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.restaurant_outlined, color: FitFuelColors.green),
                              const SizedBox(width: 10),
                              Expanded(child: Text(meal.name, style: const TextStyle(fontWeight: FontWeight.w800))),
                              if (meal.source == 'elevatine')
                                const Text('Elavatine 同步', style: TextStyle(fontSize: 11, color: FitFuelColors.muted)),
                            ],
                          ),
                          const Divider(height: 20),
                          if (meal.items.isEmpty)
                            const Text('暂无食品', style: TextStyle(color: FitFuelColors.muted))
                          else
                            ...meal.items.map(
                              (item) => InkWell(
                                onTap: () => _openMealItemEditor(item),
                                borderRadius: BorderRadius.circular(10),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 5),
                                  child: Row(
                                    children: [
                                      Expanded(child: Text('${item.name}\n${item.quantity} ${item.unit}', style: const TextStyle(height: 1.4))),
                                      Text('${item.calories.toStringAsFixed(0)} kcal', style: const TextStyle(fontWeight: FontWeight.w700)),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          const SizedBox(height: 10),
                          SizedBox(
                            width: double.infinity,
                            child: OutlinedButton.icon(
                              onPressed: () => _openFoodSearch(meal.type, meal.name),
                              icon: const Icon(Icons.add),
                              label: const Text('添加食品'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                SurfaceSection(
                  child: Row(
                    children: [
                      const Icon(Icons.water_drop_outlined, color: FitFuelColors.blue),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          '饮水量\n${data.water.toStringAsFixed(0)} / ${_number(goal['water_ml']).toStringAsFixed(0)} ml',
                          style: const TextStyle(fontWeight: FontWeight.w700, height: 1.5),
                        ),
                      ),
                      OutlinedButton(onPressed: _recordWater, child: const Text('记录饮水')),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      );

  double _number(dynamic value) =>
      value is num ? value.toDouble() : double.tryParse('$value') ?? 0;
}

class _MealItemEditor extends ConsumerStatefulWidget {
  const _MealItemEditor({required this.item});

  final MealItem item;

  @override
  ConsumerState<_MealItemEditor> createState() => _MealItemEditorState();
}

class _MealItemEditorState extends ConsumerState<_MealItemEditor> {
  late final TextEditingController nameController;
  late final TextEditingController quantityController;
  late final TextEditingController unitController;
  late final TextEditingController gramWeightController;
  late final TextEditingController caloriesController;
  late final TextEditingController carbohydrateController;
  late final TextEditingController proteinController;
  late final TextEditingController fatController;
  late final TextEditingController fiberController;
  bool saving = false;
  String? error;

  @override
  void initState() {
    super.initState();
    final item = widget.item;
    nameController = TextEditingController(text: item.name);
    quantityController = TextEditingController(text: _editableNumber(item.quantity));
    unitController = TextEditingController(text: item.unit);
    gramWeightController = TextEditingController(
      text: item.gramWeight == null ? '' : _editableNumber(item.gramWeight!),
    );
    caloriesController = TextEditingController(text: _editableNumber(item.calories));
    carbohydrateController = TextEditingController(text: _editableNumber(item.carbohydrate));
    proteinController = TextEditingController(text: _editableNumber(item.protein));
    fatController = TextEditingController(text: _editableNumber(item.fat));
    fiberController = TextEditingController(text: _editableNumber(item.dietaryFiber));
  }

  @override
  void dispose() {
    nameController.dispose();
    quantityController.dispose();
    unitController.dispose();
    gramWeightController.dispose();
    caloriesController.dispose();
    carbohydrateController.dispose();
    proteinController.dispose();
    fatController.dispose();
    fiberController.dispose();
    super.dispose();
  }

  double? _requiredNumber(TextEditingController controller) {
    final value = double.tryParse(controller.text.trim());
    return value != null && value >= 0 ? value : null;
  }

  Future<void> _save() async {
    final name = nameController.text.trim();
    final unit = unitController.text.trim();
    final quantity = _requiredNumber(quantityController);
    final calories = _requiredNumber(caloriesController);
    final carbohydrate = _requiredNumber(carbohydrateController);
    final protein = _requiredNumber(proteinController);
    final fat = _requiredNumber(fatController);
    final fiber = _requiredNumber(fiberController);
    final gramText = gramWeightController.text.trim();
    final gramWeight = gramText.isEmpty ? null : double.tryParse(gramText);
    if (name.isEmpty || unit.isEmpty || quantity == null || quantity <= 0 ||
        calories == null || carbohydrate == null || protein == null || fat == null ||
        fiber == null || (gramWeight != null && gramWeight <= 0)) {
      setState(() => error = '请填写有效的食品名称、数量、单位和营养数据');
      return;
    }
    setState(() {
      saving = true;
      error = null;
    });
    try {
      await ref.read(apiClientProvider).patch<Map<String, dynamic>>(
        '/api/meals/items/${widget.item.id}',
        data: {
          'name': name,
          'quantity': quantity,
          'unit': unit,
          'gramWeight': gramWeight,
          'calories': calories,
          'carbohydrate': carbohydrate,
          'protein': protein,
          'fat': fat,
          'dietaryFiber': fiber,
        },
      );
      if (!mounted) return;
      Navigator.pop(context, true);
    } on DioException catch (exception) {
      if (mounted) setState(() => error = _apiMessage(exception, '保存食品失败'));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('删除食品'),
        content: Text('确定从本餐中删除“${widget.item.name}”吗？'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('取消')),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade700),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() {
      saving = true;
      error = null;
    });
    try {
      await ref.read(apiClientProvider).delete<Map<String, dynamic>>(
        '/api/meals/items/${widget.item.id}',
      );
      if (!mounted) return;
      Navigator.pop(context, true);
    } on DioException catch (exception) {
      if (mounted) setState(() => error = _apiMessage(exception, '删除食品失败'));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => FractionallySizedBox(
        heightFactor: .94,
        child: Scaffold(
          backgroundColor: FitFuelColors.paper,
          appBar: AppBar(
            title: const Text('编辑食品详情'),
            leading: IconButton(
              onPressed: saving ? null : () => Navigator.pop(context),
              icon: const Icon(Icons.close),
            ),
            actions: [
              IconButton(
                tooltip: '删除食品',
                onPressed: saving ? null : _delete,
                icon: const Icon(Icons.delete_outline),
              ),
            ],
          ),
          body: SafeArea(
            top: false,
            child: Column(
              children: [
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(18, 12, 18, 20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          '仅修改本次餐食记录，不会更新共享食品库。',
                          style: TextStyle(color: FitFuelColors.muted),
                        ),
                        const SizedBox(height: 16),
                        _EditorField(label: '食品名称', controller: nameController),
                        Row(
                          children: [
                            Expanded(child: _EditorField(label: '数量', controller: quantityController, numeric: true)),
                            const SizedBox(width: 12),
                            Expanded(child: _EditorField(label: '单位', controller: unitController)),
                          ],
                        ),
                        _EditorField(label: '克重（可选）', controller: gramWeightController, numeric: true),
                        _EditorField(label: '热量（kcal）', controller: caloriesController, numeric: true),
                        Row(
                          children: [
                            Expanded(child: _EditorField(label: '碳水（g）', controller: carbohydrateController, numeric: true)),
                            const SizedBox(width: 12),
                            Expanded(child: _EditorField(label: '蛋白质（g）', controller: proteinController, numeric: true)),
                          ],
                        ),
                        Row(
                          children: [
                            Expanded(child: _EditorField(label: '脂肪（g）', controller: fatController, numeric: true)),
                            const SizedBox(width: 12),
                            Expanded(child: _EditorField(label: '膳食纤维（g）', controller: fiberController, numeric: true)),
                          ],
                        ),
                        if (error != null) ...[
                          const SizedBox(height: 4),
                          Text(error!, style: TextStyle(color: Colors.red.shade700)),
                        ],
                      ],
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(18, 10, 18, 18),
                  child: SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: saving ? null : _save,
                      child: saving
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Text('保存食品信息'),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
}

class _EditorField extends StatelessWidget {
  const _EditorField({
    required this.label,
    required this.controller,
    this.numeric = false,
  });

  final String label;
  final TextEditingController controller;
  final bool numeric;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: TextField(
          controller: controller,
          keyboardType: numeric
              ? const TextInputType.numberWithOptions(decimal: true)
              : TextInputType.text,
          decoration: InputDecoration(labelText: label),
        ),
      );
}

String _editableNumber(num value) {
  final decimal = value.toDouble();
  return decimal == decimal.roundToDouble()
      ? decimal.toInt().toString()
      : decimal.toString();
}

class _FoodSearchSheet extends ConsumerStatefulWidget {
  const _FoodSearchSheet({required this.date, required this.mealType, required this.mealName});

  final String date;
  final String mealType;
  final String mealName;

  @override
  ConsumerState<_FoodSearchSheet> createState() => _FoodSearchSheetState();
}

class _FoodSearchSheetState extends ConsumerState<_FoodSearchSheet> {
  final queryController = TextEditingController();
  bool loading = false;
  String? error;
  List<Map<String, dynamic>> foods = const [];

  @override
  void dispose() {
    queryController.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    final query = queryController.text.trim();
    if (query.isEmpty) return;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final response = await ref.read(apiClientProvider).get<Map<String, dynamic>>(
        '/api/foods',
        query: {'q': query},
      );
      if (!mounted) return;
      setState(() {
        foods = ((response.data?['foods'] as List?) ?? const [])
            .whereType<Map>()
            .map((item) => item.cast<String, dynamic>())
            .toList();
      });
    } on DioException catch (exception) {
      if (mounted) setState(() => error = _apiMessage(exception, '食品搜索失败'));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _add(Map<String, dynamic> food) async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      await ref.read(apiClientProvider).post<Map<String, dynamic>>(
        '/api/meals/items',
        data: {
          'date': widget.date,
          'mealType': widget.mealType,
          'foodKey': food['key'],
          'quantity': 1,
        },
      );
      if (mounted) Navigator.pop(context, true);
    } on DioException catch (exception) {
      if (mounted) setState(() => error = _apiMessage(exception, '添加食品失败'));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(
          18,
          18,
          18,
          MediaQuery.viewInsetsOf(context).bottom + 18,
        ),
        child: SizedBox(
          height: MediaQuery.sizeOf(context).height * .72,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('添加到${widget.mealName}', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 14),
              TextField(
                controller: queryController,
                autofocus: true,
                textInputAction: TextInputAction.search,
                onSubmitted: (_) => _search(),
                decoration: InputDecoration(
                  hintText: '搜索共享食品或私人食品',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: IconButton(onPressed: _search, icon: const Icon(Icons.arrow_forward)),
                ),
              ),
              if (error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Text(error!, style: TextStyle(color: Colors.red.shade700)),
                ),
              const SizedBox(height: 10),
              if (loading) const LinearProgressIndicator(),
              Expanded(
                child: foods.isEmpty && !loading
                    ? const Center(child: Text('输入食品名称开始搜索', style: TextStyle(color: FitFuelColors.muted)))
                    : ListView.separated(
                        itemCount: foods.length,
                        separatorBuilder: (_, _) => const Divider(height: 1),
                        itemBuilder: (context, index) {
                          final food = foods[index];
                          return ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text('${food['name'] ?? '食品'}', style: const TextStyle(fontWeight: FontWeight.w700)),
                            subtitle: Text('${food['serving'] ?? '100g'} · ${_foodNumber(food['protein']).toStringAsFixed(1)}g 蛋白质'),
                            trailing: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text('${_foodNumber(food['calories']).toStringAsFixed(0)} kcal'),
                                IconButton(onPressed: loading ? null : () => _add(food), icon: const Icon(Icons.add_circle_outline, color: FitFuelColors.green)),
                              ],
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      );
}

double _foodNumber(dynamic value) =>
    value is num ? value.toDouble() : double.tryParse('$value') ?? 0;

String _apiMessage(DioException exception, String fallback) {
  final data = exception.response?.data;
  if (data is Map && data['error'] != null) return '${data['error']}';
  return fallback;
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off, color: FitFuelColors.muted),
            const SizedBox(height: 8),
            const Text('暂时无法加载数据'),
            TextButton(onPressed: onRetry, child: const Text('重试')),
          ],
        ),
      );
}
