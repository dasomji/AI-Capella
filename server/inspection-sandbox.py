"""Fail-closed Linux sandbox shared by source inspection and future rasterization."""
import ctypes
import errno
import os
import resource
import sys

# Virtual address space also covers native buffers; V8's JS heap limit does not.
resource.setrlimit(resource.RLIMIT_AS, (1536 * 1024 * 1024,) * 2)
resource.setrlimit(resource.RLIMIT_CPU, (5, 6))
resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
resource.setrlimit(resource.RLIMIT_FSIZE, (64 * 1024 * 1024,) * 2)
lib = ctypes.CDLL('libseccomp.so.2', use_errno=True)
lib.seccomp_init.restype = ctypes.c_void_p
lib.seccomp_syscall_resolve_name.argtypes = [ctypes.c_char_p]
lib.seccomp_rule_add.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int, ctypes.c_uint]
lib.seccomp_load.argtypes = [ctypes.c_void_p]
ctx = lib.seccomp_init(0x7fff0000)  # allow, except network creation/access
if not ctx:
    raise RuntimeError('seccomp_init failed')
for name in (b'socket', b'socketpair', b'connect', b'bind', b'listen', b'accept', b'accept4', b'sendto', b'sendmsg'):
    number = lib.seccomp_syscall_resolve_name(name)
    if number >= 0 and lib.seccomp_rule_add(ctx, 0x50000 | errno.EPERM, number, 0) != 0:
        raise RuntimeError('seccomp_rule_add failed')
if lib.seccomp_load(ctx) != 0:
    raise RuntimeError('seccomp_load failed')
os.execv(sys.argv[1], sys.argv[1:])
