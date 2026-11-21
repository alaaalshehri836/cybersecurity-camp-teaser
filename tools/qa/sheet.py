import sys, glob
from PIL import Image, ImageDraw
out, pat, cols, w = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
fs = sorted(glob.glob(pat)); ims = [Image.open(f) for f in fs]
h = int(ims[0].height * w / ims[0].width); rows = (len(ims) + cols - 1) // cols
S = Image.new('RGB', (cols * w, rows * h), 'black'); d = ImageDraw.Draw(S)
for i, (f, im) in enumerate(zip(fs, ims)):
    x, y = (i % cols) * w, (i // cols) * h; S.paste(im.resize((w, h)), (x, y)); d.text((x + 6, y + 6), f.split('_')[-1][:-4] + 's', fill=(237, 237, 237))
S.save(out)
