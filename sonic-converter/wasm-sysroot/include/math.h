#ifndef _MATH_H
#define _MATH_H
double cos(double x);
double sin(double x);
double tan(double x);
double acos(double x);
double asin(double x);
double atan(double x);
double atan2(double y, double x);
double exp(double x);
double log(double x);
double log2(double x);
double log10(double x);
double pow(double x, double y);
double sqrt(double x);
double fabs(double x);
double floor(double x);
double ceil(double x);
double fmod(double x, double y);
double ldexp(double x, int exp);
double frexp(double x, int *exp);
float cosf(float x);
float sinf(float x);
float sqrtf(float x);
float fabsf(float x);
float floorf(float x);
float ceilf(float x);
float powf(float x, float y);
float logf(float x);
float log10f(float x);
float expf(float x);
float log2f(float x);
#define HUGE_VAL __builtin_huge_val()
#define INFINITY __builtin_inf()
#define NAN __builtin_nan("")
#define isnan(x) __builtin_isnan(x)
#define isinf(x) __builtin_isinf(x)
#define isfinite(x) __builtin_isfinite(x)
#endif
