import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../app/app.dart';
import '../../app/theme.dart';
import '../../core/widgets/app_page.dart';

class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider); final displayName = auth.user?.displayName ?? '用户';
    return AppPage(eyebrow: 'Settings', title: '设置中心', child: Column(children: [
      SurfaceSection(child: Row(children: [Container(width: 48, height: 48, decoration: BoxDecoration(color: FitFuelColors.green.withValues(alpha: .12), shape: BoxShape.circle), child: Center(child: Text(displayName.isNotEmpty ? displayName.substring(0, 1).toUpperCase() : 'U', style: const TextStyle(fontWeight: FontWeight.w800, color: FitFuelColors.green)))), const SizedBox(width: 12), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(displayName, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)), Text(auth.user?.email ?? '', style: const TextStyle(color: FitFuelColors.muted, fontSize: 12))]))])),
      const SizedBox(height: 14), _Group(title: '我的数据', items: const [('个人资料', Icons.person_outline), ('营养目标', Icons.track_changes_outlined), ('身体数据', Icons.monitor_weight_outlined), ('私人食品', Icons.inventory_2_outlined), ('数据导入导出', Icons.import_export_outlined)], onTap: (_) {}),
      const SizedBox(height: 14), _Group(title: '系统', items: const [('修改密码', Icons.lock_outline), ('回收站', Icons.delete_outline)], onTap: (_) {}),
      if (auth.isAdmin) ...[const SizedBox(height: 14), _Group(title: '管理员', items: const [('用户账号管理', Icons.people_outline), ('共享食品维护', Icons.restaurant_outlined)], onTap: (_) {})],
      const SizedBox(height: 22), SizedBox(width: double.infinity, child: OutlinedButton.icon(onPressed: () async { await ref.read(authControllerProvider).logout(); if (context.mounted) context.go('/login'); }, icon: const Icon(Icons.logout), label: const Text('退出登录')))
    ]));
  }
}
class _Group extends StatelessWidget {
  const _Group({required this.title, required this.items, required this.onTap}); final String title; final List<(String, IconData)> items; final void Function(String) onTap;
  @override Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Padding(padding: const EdgeInsets.only(left: 4, bottom: 8), child: Text(title, style: const TextStyle(fontSize: 12, color: FitFuelColors.muted, fontWeight: FontWeight.w700))), SurfaceSection(padding: EdgeInsets.zero, child: Column(children: [for (final item in items) ListTile(onTap: () => onTap(item.$1), leading: Icon(item.$2, color: FitFuelColors.green), title: Text(item.$1), trailing: const Icon(Icons.chevron_right, color: FitFuelColors.muted))]))]);
}
