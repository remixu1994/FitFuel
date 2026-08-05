import 'package:dio/dio.dart';

class ApiClient {
  ApiClient({Dio? dio}) : dio = dio ?? Dio(BaseOptions(baseUrl: _baseUrl));

  static const _baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000',
  );
  final Dio dio;
  String? accessToken;
  Future<void> Function()? onUnauthorized;

  Future<Response<T>> get<T>(String path, {Map<String, dynamic>? query, bool skipRefresh = false}) =>
      _send(() => dio.get<T>(path, queryParameters: query, options: _options()), skipRefresh: skipRefresh);

  Future<Response<T>> post<T>(String path, {Object? data, bool skipRefresh = false}) =>
      _send(() => dio.post<T>(path, data: data, options: _options()), skipRefresh: skipRefresh);

  Future<Response<T>> _send<T>(Future<Response<T>> Function() action, {required bool skipRefresh}) async {
    try {
      return await action();
    } on DioException catch (error) {
      if (!skipRefresh && error.response?.statusCode == 401 && onUnauthorized != null) {
        await onUnauthorized!();
        return action();
      }
      rethrow;
    }
  }

  Options _options() => Options(
        headers: accessToken == null ? null : {'Authorization': 'Bearer $accessToken'},
      );
}
