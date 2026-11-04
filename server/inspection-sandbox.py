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
for name in (b'socket', b'socketpair', b'connect', b'bind', b'listen', b'accept', b'accept4', b'sendto', b'sendmsg', b'socketcall', b'io_uring_setup', b'io_uring_enter', b'io_uring_register'):
    number = lib.seccomp_syscall_resolve_name(name)
    if number < 0 and name == b'socket':
        raise RuntimeError('required socket syscall unavailable')
    if number >= 0 and lib.seccomp_rule_add(ctx, 0x50000 | errno.EPERM, number, 0) != 0:
        raise RuntimeError('seccomp_rule_add failed')
if lib.seccomp_load(ctx) != 0:
    raise RuntimeError('seccomp_load failed')
# Landlock denies /proc (including the parent's environ), /sys and device files.
# Linux >=5.13 is required; missing kernel support fails the startup canary.
libc = ctypes.CDLL(None, use_errno=True)
class Ruleset(ctypes.Structure):
    _fields_ = [('handled_access_fs', ctypes.c_uint64)]
class PathRule(ctypes.Structure):
    _fields_ = [('allowed_access', ctypes.c_uint64), ('parent_fd', ctypes.c_int32)]
abi = libc.syscall(444, 0, 0, 1)
if abi < 1:
    raise RuntimeError('Landlock unavailable')
access = (1 << (15 if abi >= 3 else 14 if abi >= 2 else 13)) - 1
ruleset = Ruleset(access)
fd = libc.syscall(444, ctypes.byref(ruleset), ctypes.sizeof(ruleset), 0)
if fd < 0:
    raise RuntimeError('Landlock ruleset failed')
for path in [os.path.join('/', p) for p in os.listdir('/') if p not in ('proc', 'sys', 'dev')] + ['/dev/null', '/dev/urandom', '/dev/random', '/proc/self']:
    try:
        path_fd = os.open(path, os.O_PATH)
    except OSError:
        continue
    allowed = access if os.path.isdir(path) else access & ((1 << 0) | (1 << 1) | (1 << 2) | (1 << 14))
    rule = PathRule(allowed, path_fd)
    if libc.syscall(445, fd, 1, ctypes.byref(rule), 0) != 0:
        raise RuntimeError('Landlock path rule failed')
    os.close(path_fd)
if libc.prctl(38, 1, 0, 0, 0) != 0 or libc.syscall(446, fd, 0) != 0:
    raise RuntimeError('Landlock restriction failed')
os.close(fd)
os.execv(sys.argv[1], sys.argv[1:])
