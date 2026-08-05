import 'package:flutter/material.dart';
import '../../app/theme.dart';
import '../../core/widgets/app_page.dart';

class ElevatinePage extends StatelessWidget {
  const ElevatinePage({super.key});
  @override
  Widget build(BuildContext context) => AppPage(
    eyebrow: 'AI food sync', title: '同步 Elavatine',
    child: Column(children: [
      SurfaceSection(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('上传饮食截图', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
        const SizedBox(height: 6), const Text('MiMo 将识别日期、营养汇总和餐次明细，确认后才会写入系统。', style: TextStyle(color: FitFuelColors.muted, height: 1.5)),
        const SizedBox(height: 18), Container(width: double.infinity, height: 160, decoration: BoxDecoration(color: FitFuelColors.green.withValues(alpha: .05), border: Border.all(color: FitFuelColors.green.withValues(alpha: .35)), borderRadius: BorderRadius.circular(16)), child: const Column(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(Icons.add_photo_alternate_outlined, size: 38, color: FitFuelColors.green), SizedBox(height: 8), Text('选择或拖入截图'), Text('支持 JPEG、PNG、WebP', style: TextStyle(color: FitFuelColors.muted, fontSize: 12))])),
        const SizedBox(height: 18), SizedBox(width: double.infinity, height: 48, child: FilledButton.icon(onPressed: () {}, icon: const Icon(Icons.upload), label: const Text('上传并开始解析'))),
      ])),
      const SizedBox(height: 18), const SurfaceSection(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('最近同步', style: TextStyle(fontWeight: FontWeight.w800)), SizedBox(height: 16), ListTile(contentPadding: EdgeInsets.zero, leading: Icon(Icons.check_circle_outline, color: FitFuelColors.green), title: Text('暂无同步批次'), subtitle: Text('上传截图后在这里查看审核进度'))])),
    ]),
  );
}
