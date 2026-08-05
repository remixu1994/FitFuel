import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../app/app.dart';
import '../../app/theme.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});
  @override ConsumerState<LoginPage> createState() => _LoginPageState();
}
class _LoginPageState extends ConsumerState<LoginPage> {
  final email = TextEditingController();
  final password = TextEditingController();
  bool obscure = true;
  @override void dispose() { email.dispose(); password.dispose(); super.dispose(); }
  Future<void> submit() async { final ok = await ref.read(authControllerProvider).login(email.text.trim(), password.text); if (ok && mounted) context.go('/'); }
  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    return Scaffold(
      body: SafeArea(child: Center(child: SingleChildScrollView(padding: const EdgeInsets.all(28), child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 430),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(width: 48, height: 48, decoration: BoxDecoration(color: FitFuelColors.green.withValues(alpha: .12), borderRadius: BorderRadius.circular(16)), child: const Icon(Icons.eco, color: FitFuelColors.green, size: 28)),
          const SizedBox(height: 30), const Text('FitFuel', style: TextStyle(fontSize: 34, fontWeight: FontWeight.w800, color: FitFuelColors.ink)), const SizedBox(height: 8), const Text('Fuel Your Best Body', style: TextStyle(color: FitFuelColors.muted, fontSize: 15)), const SizedBox(height: 42),
          const Text('登录你的营养空间', style: TextStyle(fontSize: 23, fontWeight: FontWeight.w700)), const SizedBox(height: 22),
          TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: '邮箱', prefixIcon: Icon(Icons.mail_outline))), const SizedBox(height: 14),
          TextField(controller: password, obscureText: obscure, decoration: InputDecoration(labelText: '密码', prefixIcon: const Icon(Icons.lock_outline), suffixIcon: IconButton(onPressed: () => setState(() => obscure = !obscure), icon: Icon(obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined)))), const SizedBox(height: 22),
          if (auth.error != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(auth.error!, style: const TextStyle(color: Colors.red))),
          SizedBox(width: double.infinity, height: 50, child: FilledButton(onPressed: auth.busy ? null : submit, child: auth.busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('登录'))),
        ]),
      )))),
    );
  }
}
