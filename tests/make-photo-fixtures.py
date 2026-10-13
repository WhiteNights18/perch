"""Generate synthetic raster fixtures; no user photos or external assets."""
from pathlib import Path
import math
import struct
import sys
import zlib

root = Path(sys.argv[1])
root.mkdir(parents=True, exist_ok=True)
(root / 'empty').mkdir()
(root / 'broken').mkdir()
(root / 'broken' / 'bad.png').write_bytes(b'not an image')

def chunk(kind, data):
    return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)

for n, palette in enumerate([((36, 66, 94), (242, 176, 115), (52, 105, 107)), ((48, 64, 88), (187, 155, 183), (77, 90, 131))], 1):
    width, height = 800, 600
    top, bottom, land = palette
    rows = []
    for y in range(height):
        row = bytearray([0])
        for x in range(width):
            t = y / height
            rgb = tuple(round(a * (1 - t) + b * t) for a, b in zip(top, bottom))
            if (x - 585) ** 2 + (y - 160) ** 2 < 66 ** 2:
                rgb = (255, 224, 169)
            if y > 380 + 55 * math.sin(x / 110):
                rgb = land
            if y > 475 + 30 * math.cos(x / 160):
                rgb = tuple(round(c * .58) for c in land)
            row.extend(rgb)
        rows.append(row)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', width, height, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(b''.join(rows))) + chunk(b'IEND', b'')
    (root / f'photo{n}.png').write_bytes(png)
(root / 'photo99.png').write_bytes(b'corrupt image fixture')
