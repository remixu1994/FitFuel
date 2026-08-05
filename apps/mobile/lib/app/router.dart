import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../core/auth/auth_controller.dart';
import '../features/activity/activity_page.dart';
import '../features/auth/login_page.dart';
import '../features/elevatine/elevatine_page.dart';
import '../features/records/records_page.dart';
import '../features/settings/settings_page.dart';
import '../features/stats/stats_page.dart';
import '../features/today/today_page.dart';

GoRouter buildRouter(AuthController auth) => GoRouter(
      initialLocation: '/',
      refreshListenable: auth,
      redirect: (context, state) {
        final login = state.matchedLocation == '/login';
        if (!auth.isAuthenticated && !login) return '/login';
        if (auth.isAuthenticated && login) return '/';
        return null;
      },
      routes: [
        GoRoute(path: '/login', builder: (_, _) => const LoginPage()),
        ShellRoute(
          builder: (_, state, child) => AppShell(location: state.matchedLocation, child: child),
          routes: [
            GoRoute(path: '/', builder: (_, _) => const TodayPage()),
            GoRoute(path: '/records', builder: (_, _) => const RecordsPage()),
            GoRoute(path: '/stats', builder: (_, _) => const StatsPage()),
            GoRoute(path: '/activity', builder: (_, _) => const ActivityPage()),
            GoRoute(path: '/ai', builder: (_, _) => const ElevatinePage()),
            GoRoute(path: '/settings', builder: (_, _) => const SettingsPage()),
          ],
        ),
      ],
    );

class AppShell extends StatelessWidget {
  const AppShell({required this.location, required this.child, super.key});
  final String location;
  final Widget child;
  int get index {
    if (location.startsWith('/records')) return 1;
    if (location.startsWith('/stats')) return 2;
    if (location.startsWith('/activity')) return 3;
    if (location.startsWith('/ai')) return 4;
    return 0;
  }
  @override
  Widget build(BuildContext context) => Scaffold(
        body: child,
        bottomNavigationBar: NavigationBar(
          selectedIndex: index,
          onDestinationSelected: (value) => context.go(['/','/records','/stats','/activity','/ai'][value]),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.today_outlined), selectedIcon: Icon(Icons.today), label: '今日'),
            NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long), label: '记录'),
            NavigationDestination(icon: Icon(Icons.insights_outlined), selectedIcon: Icon(Icons.insights), label: '统计'),
            NavigationDestination(icon: Icon(Icons.fitness_center_outlined), selectedIcon: Icon(Icons.fitness_center), label: '运动'),
            NavigationDestination(icon: Icon(Icons.auto_awesome_outlined), selectedIcon: Icon(Icons.auto_awesome), label: 'AI'),
          ],
        ),
      );
}
