import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureTokenStore {
  static const _refreshTokenKey = 'fitfuel.refresh_token';
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  Future<String?> readRefreshToken() => _storage.read(key: _refreshTokenKey);
  Future<void> writeRefreshToken(String value) => _storage.write(key: _refreshTokenKey, value: value);
  Future<void> clear() => _storage.delete(key: _refreshTokenKey);
}
