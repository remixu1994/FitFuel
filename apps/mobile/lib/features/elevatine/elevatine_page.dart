import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../app/app.dart';
import '../../app/theme.dart';
import '../../core/widgets/app_page.dart';

class ElevatinePage extends ConsumerStatefulWidget {
  const ElevatinePage({super.key});

  @override
  ConsumerState<ElevatinePage> createState() => _ElevatinePageState();
}

class _ElevatinePageState extends ConsumerState<ElevatinePage> {
  final picker = ImagePicker();
  List<XFile> files = const [];
  List<Map<String, dynamic>> history = const [];
  Map<String, dynamic>? batch;
  int year = DateTime.now().year;
  bool busy = false;
  double uploadProgress = 0;
  String? error;
  String stage = '选择截图';

  @override
  void initState() {
    super.initState();
    _loadHistory();
  }

  Future<void> _loadHistory() async {
    try {
      final response = await ref
          .read(apiClientProvider)
          .get<Map<String, dynamic>>('/api/elevatine-imports');
      if (!mounted) return;
      setState(() {
        history = ((response.data?['batches'] as List?) ?? const [])
            .whereType<Map>()
            .map((item) => item.cast<String, dynamic>())
            .toList();
      });
    } catch (_) {
      // History is secondary; upload remains available when it cannot load.
    }
  }

  Future<void> _pickImages() async {
    if (busy) return;
    try {
      final selected = await picker.pickMultiImage(limit: 20);
      if (selected.isEmpty || !mounted) return;
      final combined = <XFile>[...files];
      for (final image in selected) {
        if (combined.length >= 20) break;
        if (!combined.any((item) => item.path == image.path)) combined.add(image);
      }
      var totalBytes = 0;
      for (final image in combined) {
        totalBytes += await image.length();
      }
      if (totalBytes > 80 * 1024 * 1024) {
        setState(() => error = '单批图片总大小不能超过 80 MB');
        return;
      }
      setState(() {
        files = combined;
        error = selected.length > 20 ? '每批最多选择 20 张图片' : null;
        stage = '已选择 ${combined.length} 张截图';
      });
    } catch (exception) {
      if (mounted) setState(() => error = '无法打开相册：$exception');
    }
  }

  Future<void> _start() async {
    if (busy) return;
    if (files.isEmpty) {
      setState(() => error = '请先选择至少一张 Elavatine 截图');
      return;
    }
    setState(() {
      busy = true;
      error = null;
      uploadProgress = 0;
      stage = '正在上传截图';
    });
    try {
      final form = FormData();
      form.fields.add(MapEntry('defaultYear', '$year'));
      for (final file in files) {
        form.files.add(
          MapEntry(
            'images',
            await MultipartFile.fromFile(file.path, filename: file.name),
          ),
        );
      }
      final created = await ref.read(apiClientProvider).post<Map<String, dynamic>>(
        '/api/elevatine-imports',
        data: form,
        onSendProgress: (sent, total) {
          if (mounted && total > 0) setState(() => uploadProgress = sent / total);
        },
      );
      final id = '${created.data?['id'] ?? ''}';
      if (id.isEmpty) throw StateError('服务器未返回同步批次 ID');
      if (mounted) {
        setState(() {
          uploadProgress = 1;
          stage = 'MiMo 正在解析 ${files.length} 张截图';
        });
      }
      final parsed = await _requestParseAndWait(id);
      if (!mounted) return;
      setState(() {
        batch = parsed;
        stage = _batchStage(parsed);
      });
      await _loadHistory();
    } on DioException catch (exception) {
      if (mounted) setState(() => error = _apiMessage(exception, '上传或解析失败，请稍后重试'));
    } catch (exception) {
      if (mounted) setState(() => error = '上传或解析失败：$exception');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<Map<String, dynamic>> _requestParseAndWait(String id) async {
    try {
      final response = await ref.read(apiClientProvider).post<Map<String, dynamic>>(
            '/api/elevatine-imports/$id/parse?async=1',
            data: const {},
          );
      final value = response.data ?? const <String, dynamic>{};
      if (_isTerminalBatch(value)) return value;
    } on DioException catch (exception) {
      final status = exception.response?.statusCode ?? 0;
      if (status >= 400 && status < 500 && status != 408 && status != 429) rethrow;
      // The reverse proxy may time out while MiMo continues on the server.
      // Polling the batch avoids reporting a successful background parse as failed.
    }
    return _pollBatch(id);
  }

  Future<Map<String, dynamic>> _pollBatch(String id) async {
    final deadline = DateTime.now().add(const Duration(minutes: 8));
    DioException? lastNetworkError;
    while (DateTime.now().isBefore(deadline)) {
      if (!mounted) throw StateError('页面已关闭');
      setState(() => stage = 'MiMo 正在解析，完成后将自动进入审核');
      await Future<void>.delayed(const Duration(seconds: 3));
      try {
        final response = await ref
            .read(apiClientProvider)
            .get<Map<String, dynamic>>('/api/elevatine-imports/$id');
        final value = response.data ?? const <String, dynamic>{};
        if (_isTerminalBatch(value)) return value;
        lastNetworkError = null;
      } on DioException catch (exception) {
        final status = exception.response?.statusCode ?? 0;
        if (status == 401 || status == 403 || status == 404) rethrow;
        lastNetworkError = exception;
      }
    }
    if (lastNetworkError != null) throw lastNetworkError;
    throw StateError('AI 解析超过 8 分钟，批次仍在服务器处理中，请稍后从最近同步中打开');
  }

  bool _isTerminalBatch(Map<String, dynamic> value) {
    final status = '${value['status'] ?? ''}';
    return status == 'review' || status == 'failed' || status == 'committed';
  }

  String _batchStage(Map<String, dynamic> value) => switch ('${value['status'] ?? ''}') {
        'review' => '解析完成，请核对后写入',
        'failed' => '解析失败，请查看具体原因',
        'committed' => '同步已完成',
        _ => 'MiMo 正在解析，完成后将自动进入审核',
      };

  Future<void> _openBatch(String id) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
      stage = '正在读取同步批次';
    });
    try {
      final response = await ref
          .read(apiClientProvider)
          .get<Map<String, dynamic>>('/api/elevatine-imports/$id');
      if (!mounted) return;
      setState(() {
        batch = response.data ?? const {};
        stage = _batchStage(batch!);
      });
    } on DioException catch (exception) {
      if (mounted) setState(() => error = _apiMessage(exception, '同步批次读取失败'));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _commit() async {
    final id = '${batch?['id'] ?? ''}';
    if (id.isEmpty || busy) return;
    final unmatched = ((batch?['unmatched'] as List?) ?? const []).length;
    if (unmatched > 0) {
      setState(() => error = '还有 $unmatched 个食品详情未匹配日期，请在 Web 审核页面处理后再提交');
      return;
    }
    setState(() {
      busy = true;
      error = null;
      stage = '正在写入 FitFuel';
    });
    try {
      final response = await ref
          .read(apiClientProvider)
          .post<Map<String, dynamic>>('/api/elevatine-imports/$id/commit', data: const {});
      if (!mounted) return;
      setState(() {
        batch = response.data ?? batch;
        stage = '同步完成';
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Elavatine 数据已写入 FitFuel')),
      );
      await _loadHistory();
    } on DioException catch (exception) {
      if (mounted) setState(() => error = _apiMessage(exception, '同步提交失败'));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _retryParse() async {
    final id = '${batch?['id'] ?? ''}';
    if (id.isEmpty || busy) return;
    setState(() {
      busy = true;
      error = null;
      stage = 'MiMo 正在重新解析截图';
    });
    try {
      final value = await _requestParseAndWait(id);
      if (!mounted) return;
      setState(() {
        batch = value;
        stage = _batchStage(value);
      });
      await _loadHistory();
    } on DioException catch (exception) {
      if (mounted) setState(() => error = _apiMessage(exception, '重新解析失败，请稍后重试'));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void _reset() {
    if (busy) return;
    setState(() {
      batch = null;
      files = const [];
      uploadProgress = 0;
      error = null;
      stage = '选择截图';
    });
  }

  @override
  Widget build(BuildContext context) {
    final activeBatch = batch;
    return AppPage(
      eyebrow: 'AI food sync',
      title: '同步 Elavatine',
      actions: [
        if (activeBatch != null)
          IconButton(onPressed: busy ? null : _reset, icon: const Icon(Icons.add_photo_alternate_outlined)),
        IconButton(onPressed: busy ? null : _loadHistory, icon: const Icon(Icons.refresh)),
      ],
      child: Column(
        children: [
          if (activeBatch == null) _buildUpload() else _buildReview(activeBatch),
          const SizedBox(height: 18),
          _buildHistory(),
        ],
      ),
    );
  }

  Widget _buildUpload() => SurfaceSection(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('上传饮食截图', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
            const SizedBox(height: 6),
            const Text('MiMo 将识别日期、营养汇总和餐次明细，确认后才会写入系统。', style: TextStyle(color: FitFuelColors.muted, height: 1.5)),
            const SizedBox(height: 18),
            InkWell(
              onTap: busy ? null : _pickImages,
              borderRadius: BorderRadius.circular(16),
              child: Container(
                width: double.infinity,
                constraints: const BoxConstraints(minHeight: 160),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: FitFuelColors.green.withValues(alpha: .05),
                  border: Border.all(color: FitFuelColors.green.withValues(alpha: .35)),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: files.isEmpty
                    ? const Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.add_photo_alternate_outlined, size: 38, color: FitFuelColors.green),
                          SizedBox(height: 8),
                          Text('点击选择截图'),
                          Text('支持 JPEG、PNG、WebP，最多 20 张', style: TextStyle(color: FitFuelColors.muted, fontSize: 12)),
                        ],
                      )
                    : SizedBox(
                        height: 210,
                        child: GridView.builder(
                          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, crossAxisSpacing: 8, mainAxisSpacing: 8),
                          itemCount: files.length,
                          itemBuilder: (context, index) => Stack(
                            fit: StackFit.expand,
                            children: [
                              ClipRRect(borderRadius: BorderRadius.circular(10), child: Image.file(File(files[index].path), fit: BoxFit.cover)),
                              Positioned(
                                right: 2,
                                top: 2,
                                child: IconButton.filledTonal(
                                  visualDensity: VisualDensity.compact,
                                  onPressed: busy ? null : () => setState(() => files = [...files]..removeAt(index)),
                                  icon: const Icon(Icons.close, size: 16),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                const Expanded(child: Text('截图默认年份', style: TextStyle(fontWeight: FontWeight.w700))),
                SizedBox(
                  width: 110,
                  child: DropdownButtonFormField<int>(
                    initialValue: year,
                    items: [for (var value = DateTime.now().year - 2; value <= DateTime.now().year + 1; value++) DropdownMenuItem(value: value, child: Text('$value'))],
                    onChanged: busy ? null : (value) => setState(() => year = value ?? year),
                  ),
                ),
              ],
            ),
            if (busy) ...[
              const SizedBox(height: 14),
              LinearProgressIndicator(value: stage.startsWith('正在上传') ? uploadProgress : null),
            ],
            const SizedBox(height: 10),
            Text(stage, style: const TextStyle(fontSize: 12, color: FitFuelColors.muted)),
            if (error != null)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(error!, style: TextStyle(color: Colors.red.shade700)),
              ),
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: FilledButton.icon(
                onPressed: busy ? null : _start,
                icon: busy
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.upload),
                label: Text(busy ? stage : '上传并开始解析（${files.length} 张）'),
              ),
            ),
          ],
        ),
      );

  Widget _buildReview(Map<String, dynamic> value) {
    final days = ((value['elevatine_import_day'] as List?) ?? const [])
        .whereType<Map>()
        .map((item) => item.cast<String, dynamic>())
        .toList();
    final unmatched = ((value['unmatched'] as List?) ?? const []).length;
    final status = '${value['status'] ?? ''}';
    final images = ((value['elevatine_import_image'] as List?) ?? const [])
        .whereType<Map>()
        .map((item) => item.cast<String, dynamic>())
        .toList();
    final imageErrors = images
        .where((image) => image['status'] == 'failed' && image['error_message'] != null)
        .map((image) => '${image['error_message']}')
        .toSet()
        .toList();
    return SurfaceSection(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.auto_awesome, color: FitFuelColors.green),
              const SizedBox(width: 10),
              Expanded(child: Text(stage, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18))),
            ],
          ),
          const SizedBox(height: 14),
          if (days.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 28),
              child: Center(
                child: Text(
                  imageErrors.isNotEmpty
                      ? 'AI 解析失败：${imageErrors.join('；')}'
                      : '没有识别到每日汇总；如果上传的是食品详情图，请同时上传对应日期的每日汇总图。',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: FitFuelColors.muted),
                ),
              ),
            )
          else
            ...days.map((day) => _DayReview(day: day)),
          if (unmatched > 0)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text('有 $unmatched 个食品详情无法自动匹配日期，需要在 Web 审核页面处理。', style: TextStyle(color: Colors.orange.shade800)),
            ),
          if (error != null)
            Padding(padding: const EdgeInsets.only(top: 10), child: Text(error!, style: TextStyle(color: Colors.red.shade700))),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            height: 48,
            child: status == 'committed'
                ? FilledButton.icon(onPressed: _reset, icon: const Icon(Icons.check), label: const Text('同步完成，继续上传'))
                : days.isEmpty && status == 'failed'
                    ? FilledButton.icon(
                        onPressed: busy ? null : _retryParse,
                        icon: busy
                            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.refresh),
                        label: Text(busy ? stage : '重新解析当前截图'),
                      )
                : FilledButton.icon(
                    onPressed: busy || days.isEmpty || unmatched > 0 ? null : _commit,
                    icon: busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.check),
                    label: Text(busy ? stage : '确认并写入 FitFuel'),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildHistory() => SurfaceSection(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('最近同步', style: TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 10),
            if (history.isEmpty)
              const ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.history, color: FitFuelColors.muted),
                title: Text('暂无同步批次'),
                subtitle: Text('上传截图后在这里查看审核进度'),
              )
            else
              ...history.take(6).map(
                    (item) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      onTap: busy ? null : () => _openBatch('${item['id']}'),
                      leading: Icon(
                        item['status'] == 'committed' ? Icons.check_circle_outline : Icons.pending_outlined,
                        color: item['status'] == 'committed' ? FitFuelColors.green : FitFuelColors.orange,
                      ),
                      title: Text('${item['dayCount'] ?? 0} 个日期 · ${item['imageCount'] ?? 0} 张截图'),
                      subtitle: Text(_date(item['createdAt'])),
                      trailing: Text(_statusLabel('${item['status'] ?? ''}'), style: const TextStyle(fontSize: 12, color: FitFuelColors.muted)),
                    ),
                  ),
          ],
        ),
      );

  String _date(dynamic value) {
    final text = '$value';
    return text.length >= 16 ? text.substring(0, 16).replaceFirst('T', ' ') : text;
  }

  String _statusLabel(String value) => switch (value) {
        'uploaded' => '待解析',
        'parsing' => '解析中',
        'review' => '待审核',
        'committed' => '已完成',
        'failed' => '失败',
        'expired' => '已过期',
        _ => value,
      };
}

class _DayReview extends StatelessWidget {
  const _DayReview({required this.day});

  final Map<String, dynamic> day;

  @override
  Widget build(BuildContext context) {
    final items = ((day['elevatine_import_item'] as List?) ?? const [])
        .whereType<Map>()
        .map((item) => item.cast<String, dynamic>())
        .toList();
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: FitFuelColors.green.withValues(alpha: .045),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: FitFuelColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(_date(day['record_date']), style: const TextStyle(fontWeight: FontWeight.w800))),
              Text('${_number(day['calories']).toStringAsFixed(0)} kcal', style: const TextStyle(fontWeight: FontWeight.w800, color: FitFuelColors.green)),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            '碳水 ${_number(day['carbohydrate']).toStringAsFixed(1)}g  ·  蛋白质 ${_number(day['protein']).toStringAsFixed(1)}g  ·  脂肪 ${_number(day['fat']).toStringAsFixed(1)}g',
            style: const TextStyle(fontSize: 12, color: FitFuelColors.muted),
          ),
          if (items.isNotEmpty) ...[
            const Divider(height: 22),
            ...items.take(8).map(
                  (item) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 3),
                    child: Row(
                      children: [
                        Expanded(child: Text('${item['food_name'] ?? '食品'}', style: const TextStyle(fontSize: 13))),
                        Text('${_number(item['calories']).toStringAsFixed(0)} kcal', style: const TextStyle(fontSize: 12)),
                      ],
                    ),
                  ),
                ),
            if (items.length > 8)
              Text('另有 ${items.length - 8} 项食品', style: const TextStyle(fontSize: 12, color: FitFuelColors.muted)),
          ],
        ],
      ),
    );
  }

  static double _number(dynamic value) =>
      value is num ? value.toDouble() : double.tryParse('$value') ?? 0;

  static String _date(dynamic value) {
    final text = '$value';
    return text.length >= 10 ? text.substring(0, 10) : text;
  }
}

String _apiMessage(DioException exception, String fallback) {
  final data = exception.response?.data;
  if (data is Map && data['error'] != null) return '${data['error']}';
  if (exception.type == DioExceptionType.connectionTimeout ||
      exception.type == DioExceptionType.receiveTimeout) {
    return 'AI 解析超时，请稍后重试';
  }
  return fallback;
}
