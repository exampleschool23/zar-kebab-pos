import json
import sys

from PIL import Image, ImageDraw, ImageFont


def main():
    if len(sys.argv) != 3:
        raise SystemExit(
            "usage: render-menu-text-overlay.py text-runs.json output.png"
        )

    input_path, output_path = sys.argv[1:]
    with open(input_path, "r", encoding="utf-8") as input_file:
        payload = json.load(input_file)

    image = Image.new(
        "RGBA",
        (int(payload["width"]), int(payload["height"])),
        (0, 0, 0, 0),
    )
    draw = ImageDraw.Draw(image)
    fonts = {}

    for run in payload["runs"]:
        font_path = run["fontPath"]
        font_size = int(run.get("fontSize", payload["fontSize"]))
        font_key = (font_path, font_size)
        if font_key not in fonts:
            fonts[font_key] = ImageFont.truetype(font_path, font_size)
        draw.text(
            (float(run["x"]), float(run["y"])),
            run["text"],
            font=fonts[font_key],
            fill=run["color"],
            anchor=run.get("anchor", "ls"),
        )

    image.save(output_path, "PNG", compress_level=9)


if __name__ == "__main__":
    main()
