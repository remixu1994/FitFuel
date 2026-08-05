import 'package:flutter/foundation.dart';

import '../network/api_client.dart';
import '../storage/secure_token_store.dart';

class AuthUser {
  const AuthUser({required this.email, required this.displayName, required this.role});
  final String email;
  final String displayName;
  final String role;
}

class AuthController extends ChangeNotifier {
  AuthController(this.api, this.tokens) { api.onUnauthorized = _refreshAccessToken; }
  final ApiClient api;
  final SecureTokenStore tokens;
  AuthUser? user;
  bool busy = false;
  String? error;

  bool get isAuthenticated => user != null && api.accessToken != null;
  bool get isAdmin => user?.role == 'admin';

  Future<void> restore() async {
    final refresh = await tokens.readRefreshToken();
    if (refresh == null) return;
    try {
      final response = await api.post<Map<String, dynamic>>(
        '/api/auth/mobile/refresh',
        data: {'refreshToken': refresh},
        skipRefresh: true,
      );
      await _apply(response.data ?? <String, dynamic>{});
    } catch (_) {
      await tokens.clear();
    }
  }

  Future<bool> login(String email, String password) async {
    busy = true;
    error = null;
    notifyListeners();
    try {
      final response = await api.post<Map<String, dynamic>>(
        '/api/auth/mobile/login',
        data: {'email': email, 'password': password, 'deviceName': 'FitFuel Android'},
      );
      await _apply(response.data ?? <String, dynamic>{});
      return true;
    } catch (e) {
      error = '登录失败，请检查账号和密码';
      return false;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> _apply(Map<String, dynamic> data) async {
    final account = (data['user'] as Map?)?.cast<String, dynamic>() ?? <String, dynamic>{};
    api.accessToken = data['accessToken'] as String?;
    final refresh = data['refreshToken'] as String?;
    if (refresh != null) await tokens.writeRefreshToken(refresh);
    if (api.accessToken != null) {
      user = AuthUser(
        email: '${account['email'] ?? ''}',
        displayName: '${account['displayName'] ?? account['display_name'] ?? ''}',
        role: '${account['role'] ?? 'user'}',
      );
      notifyListeners();
    }
  }

  Future<void> _refreshAccessToken() async {
    if (api.accessToken == null) throw StateError('No active access token');
    final refresh = await tokens.readRefreshToken();
    if (refresh == null) throw StateError('No refresh token');
    try {
      final response = await api.post<Map<String, dynamic>>('/api/auth/mobile/refresh', data: {'refreshToken': refresh}, skipRefresh: true);
      await _apply(response.data ?? <String, dynamic>{});
    } catch (_) {
      await tokens.clear();
      api.accessToken = null;
      user = null;
      notifyListeners();
      rethrow;
    }
  }

  Future<void> logout() async {
    try {
      await api.post('/api/auth/mobile/logout');
    } catch (_) {}
    api.accessToken = null;
    user = null;
    await tokens.clear();
    notifyListeners();
  }
}
