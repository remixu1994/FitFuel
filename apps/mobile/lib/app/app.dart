import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/auth/auth_controller.dart';
import '../core/network/api_client.dart';
import 'router.dart';
import 'theme.dart';

final authControllerProvider = ChangeNotifierProvider<AuthController>((ref) {
  throw UnimplementedError('AuthController must be overridden by FitFuelApp');
});
final apiClientProvider = Provider<ApiClient>((ref) => ref.watch(authControllerProvider).api);

class FitFuelApp extends StatelessWidget {
  const FitFuelApp({required this.auth, super.key});
  final AuthController auth;

  @override
  Widget build(BuildContext context) => ProviderScope(
        overrides: [authControllerProvider.overrideWith((ref) => auth)],
        child: MaterialApp.router(
          title: 'FitFuel',
          debugShowCheckedModeBanner: false,
          theme: buildFitFuelTheme(),
          routerConfig: buildRouter(auth),
        ),
      );
}
