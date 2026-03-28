#ifndef _UNISTD_H
#define _UNISTD_H
#include <stddef.h>
typedef long ssize_t;
typedef int off_t;
ssize_t read(int fd, void *buf, size_t count);
ssize_t write(int fd, const void *buf, size_t count);
int close(int fd);
off_t lseek(int fd, off_t offset, int whence);
#endif
