/// Stable API paths shared by the Flutter client and the Web server.
/// DTOs intentionally stay as JSON maps at the network boundary so the mobile
/// app can tolerate additive fields from the Web API.
abstract final class ApiPaths {
  static const mobileLogin = '/api/auth/mobile/login';
  static const mobileRefresh = '/api/auth/mobile/refresh';
  static const mobileLogout = '/api/auth/mobile/logout';
  static const mobileSession = '/api/auth/mobile/session';
  static const foods = '/api/foods';
  static const records = '/api/records';
  static const stats = '/api/stats';
  static const activity = '/api/activity';
  static const elevatineImports = '/api/elevatine-imports';
}

enum ApiStatus {
  unauthenticated,
  forbidden,
  conflict,
  invalid,
  rateLimited,
  unavailable,
}

ApiStatus? classifyStatus(int? status) {
  if (status == null) return null;
  if (status == 401) return ApiStatus.unauthenticated;
  if (status == 403) return ApiStatus.forbidden;
  if (status == 409) return ApiStatus.conflict;
  if (status == 422) return ApiStatus.invalid;
  if (status == 429) return ApiStatus.rateLimited;
  if (status >= 500) return ApiStatus.unavailable;
  return null;
}
