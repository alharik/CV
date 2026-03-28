#ifndef _STDLIB_H
#define _STDLIB_H
#include <stddef.h>
void *malloc(size_t size);
void *calloc(size_t nmemb, size_t size);
void *realloc(void *ptr, size_t size);
void free(void *ptr);
void abort(void) __attribute__((noreturn));
void exit(int status) __attribute__((noreturn));
int abs(int j);
long labs(long j);
int atoi(const char *nptr);
long atol(const char *nptr);
double atof(const char *nptr);
double strtod(const char *nptr, char **endptr);
long strtol(const char *nptr, char **endptr, int base);
unsigned long strtoul(const char *nptr, char **endptr, int base);
void qsort(void *base, size_t nmemb, size_t size, int (*compar)(const void *, const void *));
#define EXIT_SUCCESS 0
#define EXIT_FAILURE 1
#define RAND_MAX 2147483647
int rand(void);
void srand(unsigned int seed);
#endif
