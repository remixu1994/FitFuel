import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';

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
        skipRefresh: true,
      );
      await _apply(response.data ?? <String, dynamic>{});
      return true;
    } on DioException catch (exception) {
      error = _loginErrorMessage(exception);
      return false;
    } catch (_) {
      error = '登录失败，客户端暂时无法处理响应';
      return false;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  String _loginErrorMessage(DioException exception) {
    final statusCode = exception.response?.statusCode;
    if (statusCode == 401) return '邮箱或密码错误';
    if (statusCode == 403) return '账号已停用或暂无登录权限';
    if (statusCode == 404) return '移动端登录接口尚未部署，请联系管理员更新服务';
    if (statusCode == 422) return '邮箱或密码格式不正确';
    if (statusCode == 429) return '登录尝试过于频繁，请稍后再试';
    if (statusCode == 500 || statusCode == 502 || statusCode == 503) {
      return '服务器暂时无法处理登录请求';
    }

    if (exception.type == DioExceptionType.connectionError ||
        exception.type == DioExceptionType.connectionTimeout ||
        exception.type == DioExceptionType.receiveTimeout ||
        exception.type == DioExceptionType.sendTimeout) {
      final detail = '${exception.error} ${exception.message}'.toLowerCase();
      if (detail.contains('certificate') ||
          detail.contains('handshake') ||
          detail.contains('cert_verify')) {
        return '无法安全连接服务器，请检查 HTTPS 证书配置';
      }
      return '无法连接服务器，请检查网络和服务地址';
    }

    return '登录失败，请稍后重试';
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
