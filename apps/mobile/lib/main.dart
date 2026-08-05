import 'package:flutter/widgets.dart';

import 'app/app.dart';
import 'core/auth/auth_controller.dart';
import 'core/network/api_client.dart';
import 'core/storage/secure_token_store.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final auth = AuthController(
    ApiClient(),
    SecureTokenStore(),
  );
  await auth.restore();
  runApp(FitFuelApp(auth: auth));
}
