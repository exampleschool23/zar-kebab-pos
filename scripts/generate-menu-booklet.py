#!/usr/bin/env python3

import json
import os
from functools import lru_cache
from io import BytesIO

from PIL import Image
from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CATALOG_PATH = os.path.join(ROOT, "artifacts", "zarkebab-full-menu-catalog.json")
OUTPUT_PATH = os.path.join(ROOT, "output", "pdf", "zar-kebab-menu-booklet-english.pdf")
IMAGE_DIR = os.path.join(ROOT, "tmp", "pdfs", "booklet-images")
BACKGROUND_PATH = os.path.join(ROOT, "tmp", "pdfs", "booklet-background.jpg")
LOGO_PATH = os.path.join(ROOT, "src", "assets", "brand", "zarkebab_logo.png")
MENU_FONT_PATH = os.path.join(ROOT, "artifacts", "fonts", "Neucha-Regular.ttf")

PAGE_W, PAGE_H = landscape(A4)

NAVY = HexColor("#102F58")
DEEP_NAVY = HexColor("#0A2442")
GOLD = HexColor("#D5A12B")
CREAM = HexColor("#FBF3DE")
INK = HexColor("#202C33")
GREEN = HexColor("#285046")
RED = HexColor("#9C2931")
HAIRLINE = HexColor("#B7A98A")

EXCLUDED_IDS = {
    "i1780390519015",
    "i1781508355657",
}

PAGE_CATEGORIES = {
    2: ["breakfast", "kebab"],
    3: ["first", "c1780408777665", "sides"],
    4: ["c1781337286710"],
    5: ["salads", "desserts"],
    6: ["c1780385299367", "drinks", "c1780304119652", "bread"],
}


def register_fonts():
    pdfmetrics.registerFont(TTFont("Neucha", MENU_FONT_PATH))


def load_catalog():
    with open(CATALOG_PATH, "r", encoding="utf-8") as stream:
        catalog = json.load(stream)
    categories = {category["id"]: category for category in catalog["categories"]}
    items_by_category = {}
    for item in catalog["items"]:
        if item["id"] in EXCLUDED_IDS:
            continue
        items_by_category.setdefault(item["category_id"], []).append(item)
    for items in items_by_category.values():
        items.sort(key=lambda item: (item.get("sort_order") or 0, item["id"]))
    return categories, items_by_category


def format_price(value):
    return f"{int(value or 0):,}"


def english_name(item):
    return (
        (item.get("name_en") or "").strip()
        or (item.get("name_uz") or "").strip()
        or (item.get("name_ru") or "").strip()
        or "Menu item"
    )


def category_name(category):
    return (
        (category.get("name_en") or "").strip()
        or (category.get("name_uz") or "").strip()
        or "Menu"
    ).upper()


@lru_cache(maxsize=64)
def cropped_image(path, pixel_w, pixel_h):
    with Image.open(path) as image:
        image = image.convert("RGB")
        source_ratio = image.width / image.height
        target_ratio = pixel_w / pixel_h
        if source_ratio > target_ratio:
            crop_w = int(image.height * target_ratio)
            left = (image.width - crop_w) // 2
            image = image.crop((left, 0, left + crop_w, image.height))
        else:
            crop_h = int(image.width / target_ratio)
            top = (image.height - crop_h) // 2
            image = image.crop((0, top, image.width, top + crop_h))
        image = image.resize((pixel_w, pixel_h), Image.Resampling.LANCZOS)
        buffer = BytesIO()
        image.save(buffer, format="JPEG", quality=92, optimize=True)
        buffer.seek(0)
        return buffer.getvalue()


def draw_crop(c, path, x, y, w, h, radius=8, caption=None):
    pixels_w = max(240, int(w * 2.4))
    pixels_h = max(180, int(h * 2.4))
    image = ImageReader(BytesIO(cropped_image(path, pixels_w, pixels_h)))
    c.saveState()
    clip = c.beginPath()
    clip.roundRect(x, y, w, h, radius)
    c.clipPath(clip, stroke=0, fill=0)
    c.drawImage(image, x, y, w, h, preserveAspectRatio=False, mask="auto")
    if caption:
        c.setFillColor(Color(0.02, 0.08, 0.15, alpha=0.76))
        c.rect(x, y, w, 24, stroke=0, fill=1)
        c.setFillColor(CREAM)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(x + 9, y + 8, caption)
    c.restoreState()
    c.setStrokeColor(GOLD)
    c.setLineWidth(1.2)
    c.roundRect(x, y, w, h, radius, stroke=1, fill=0)


def draw_background(c):
    c.drawImage(BACKGROUND_PATH, 0, 0, PAGE_W, PAGE_H, preserveAspectRatio=False)
    c.setStrokeColor(NAVY)
    c.setLineWidth(1.7)
    c.rect(10, 10, PAGE_W - 20, PAGE_H - 20, stroke=1, fill=0)
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.8)
    c.rect(15, 15, PAGE_W - 30, PAGE_H - 30, stroke=1, fill=0)


def draw_corner_mark(c, x, y, sx=1, sy=1):
    c.saveState()
    c.translate(x, y)
    c.scale(sx, sy)
    c.setStrokeColor(GOLD)
    c.setLineWidth(2)
    path = c.beginPath()
    path.moveTo(0, 0)
    path.lineTo(44, 0)
    path.lineTo(44, 7)
    path.lineTo(18, 7)
    path.lineTo(18, 34)
    path.lineTo(10, 34)
    path.lineTo(10, 12)
    path.lineTo(0, 12)
    c.drawPath(path)
    c.setLineWidth(1.5)
    c.rect(25, 16, 16, 16, stroke=1, fill=0)
    c.restoreState()


def draw_page_header(c, title, page_number):
    c.setFillColor(NAVY)
    c.rect(0, PAGE_H - 74, PAGE_W, 74, stroke=0, fill=1)
    c.setStrokeColor(GOLD)
    c.setLineWidth(1.5)
    c.line(18, PAGE_H - 70, PAGE_W - 18, PAGE_H - 70)
    c.drawImage(LOGO_PATH, 26, PAGE_H - 72, 82, 82, preserveAspectRatio=True, mask="auto")
    c.setFillColor(CREAM)
    c.setFont("Times-Bold", 26)
    c.drawCentredString(PAGE_W / 2, PAGE_H - 37, title)
    c.setStrokeColor(GOLD)
    c.setLineWidth(1)
    c.line(PAGE_W / 2 - 150, PAGE_H - 49, PAGE_W / 2 + 150, PAGE_H - 49)
    c.setFillColor(GOLD)
    c.rect(PAGE_W / 2 - 3, PAGE_H - 52, 6, 6, stroke=0, fill=1)
    draw_corner_mark(c, 12, PAGE_H - 15, 1, -1)
    draw_corner_mark(c, PAGE_W - 12, PAGE_H - 15, -1, -1)
    c.setFillColor(CREAM)
    c.setFont("Helvetica-Bold", 8)
    c.drawRightString(PAGE_W - 28, PAGE_H - 42, f"{page_number} / 6")


def draw_footer(c):
    c.setStrokeColor(NAVY)
    c.setLineWidth(0.7)
    c.line(112, 36, PAGE_W - 112, 36)
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawString(118, 23, "17 Matbuotchilar St · Tashkent")
    c.drawCentredString(PAGE_W / 2, 23, "+998 90 509-55-45 · zarkebab.uz")
    c.drawRightString(PAGE_W - 118, 23, "Open daily 08:00-01:00")


def split_line(text, font_name, font_size, max_width):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and pdfmetrics.stringWidth(candidate, font_name, font_size) > max_width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines or ["-"]


def draw_section(c, title, items, x, top, width, font_size=12.5, row_height=18):
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(x, top, title)
    c.setStrokeColor(NAVY)
    c.setLineWidth(1)
    c.line(x, top - 5, x + width, top - 5)
    y = top - 22
    price_width = 58
    name_width = width - price_width - 8
    for item in items:
        lines = split_line(english_name(item), "Neucha", font_size, name_width)
        row_h = row_height + (len(lines) - 1) * (font_size + 1)
        c.setFillColor(GREEN)
        c.setFont("Neucha", font_size)
        for index, line in enumerate(lines):
            c.drawString(x, y - index * (font_size + 1), line)
        c.setFillColor(NAVY)
        c.setFont("Helvetica-Bold", 9.5)
        c.drawRightString(x + width, y, format_price(item.get("price")))
        c.setStrokeColor(HAIRLINE)
        c.setLineWidth(0.3)
        c.line(x, y - row_h + 5, x + width, y - row_h + 5)
        y -= row_h
    return y


def draw_photo_strip(c, photos, y=386, h=122):
    margin = 34
    gap = 12
    width = (PAGE_W - margin * 2 - gap * (len(photos) - 1)) / len(photos)
    for index, (filename, caption) in enumerate(photos):
        draw_crop(
            c,
            os.path.join(IMAGE_DIR, filename),
            margin + index * (width + gap),
            y,
            width,
            h,
            caption=caption,
        )


def draw_cover(c):
    c.setFillColor(DEEP_NAVY)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    c.setFillColor(Color(0.05, 0.18, 0.33, alpha=0.65))
    for x in range(-20, int(PAGE_W) + 60, 56):
        for y in range(-20, int(PAGE_H) + 60, 56):
            c.saveState()
            c.translate(x, y)
            c.rotate(45)
            c.setStrokeColor(Color(0.3, 0.48, 0.65, alpha=0.12))
            c.setLineWidth(0.6)
            c.rect(0, 0, 30, 30, stroke=1, fill=0)
            c.restoreState()
    c.setStrokeColor(GOLD)
    c.setLineWidth(2)
    c.rect(14, 14, PAGE_W - 28, PAGE_H - 28, stroke=1, fill=0)
    draw_corner_mark(c, 20, PAGE_H - 20, 1.4, -1.4)
    draw_corner_mark(c, PAGE_W - 20, PAGE_H - 20, -1.4, -1.4)
    draw_corner_mark(c, 20, 20, 1.4, 1.4)
    draw_corner_mark(c, PAGE_W - 20, 20, -1.4, 1.4)

    c.drawImage(
        LOGO_PATH,
        PAGE_W / 2 - 92,
        PAGE_H - 198,
        184,
        184,
        preserveAspectRatio=True,
        mask="auto",
    )
    c.setFillColor(CREAM)
    c.setFont("Times-Bold", 39)
    c.drawCentredString(PAGE_W / 2, PAGE_H - 205, "MENU BOOKLET")
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(
        PAGE_W / 2,
        PAGE_H - 227,
        "TRADITIONAL UZBEK & EUROPEAN CUISINE",
    )
    c.setStrokeColor(GOLD)
    c.setLineWidth(1)
    c.line(PAGE_W / 2 - 180, PAGE_H - 240, PAGE_W / 2 + 180, PAGE_H - 240)

    draw_crop(
        c,
        os.path.join(IMAGE_DIR, "cover-plov.webp"),
        56,
        82,
        350,
        245,
        radius=16,
        caption="PLOV · A ZAR KEBAB FAVOURITE",
    )
    draw_crop(
        c,
        os.path.join(IMAGE_DIR, "shashlik-chicken.png"),
        436,
        82,
        350,
        245,
        radius=16,
        caption="SHASHLIK · GRILLED OVER FIRE",
    )

    c.setFillColor(CREAM)
    c.setFont("Helvetica-Bold", 10)
    c.drawCentredString(
        PAGE_W / 2,
        50,
        "17 Matbuotchilar St, Tashkent  ·  +998 90 509-55-45  ·  zarkebab.uz",
    )
    c.setFillColor(GOLD)
    c.setFont("Helvetica", 8)
    c.drawCentredString(PAGE_W / 2, 34, "OPEN DAILY 08:00-01:00")


def draw_page_two(c, categories, items):
    draw_background(c)
    draw_page_header(c, "BREAKFAST & SHASHLIK", 2)
    draw_photo_strip(
        c,
        [
            ("shashlik-chicken.png", "CHICKEN FILLET SHASHLIK"),
            ("shashlik-beef.png", "BEEF SHASHLIK"),
            ("shashlik-vegetable.jpg", "VEGETABLE SHASHLIK"),
        ],
    )
    draw_section(
        c,
        category_name(categories["breakfast"]),
        items["breakfast"],
        46,
        360,
        350,
        font_size=15,
        row_height=24,
    )
    draw_section(
        c,
        category_name(categories["kebab"]),
        items["kebab"],
        446,
        360,
        350,
        font_size=15,
        row_height=24,
    )
    draw_footer(c)


def draw_page_three(c, categories, items):
    draw_background(c)
    draw_page_header(c, "SOUPS, QURUTOB & SIDES", 3)
    draw_photo_strip(
        c,
        [
            ("soup-mastava.png", "MASTAVA"),
            ("soup-pelmeni.png", "PELMENI SOUP"),
            ("qurutob.png", "QURUTOBA"),
        ],
    )
    draw_section(
        c,
        category_name(categories["first"]),
        items["first"],
        46,
        360,
        440,
        font_size=14,
        row_height=21,
    )
    right_y = draw_section(
        c,
        category_name(categories["c1780408777665"]),
        items["c1780408777665"],
        530,
        360,
        266,
        font_size=15,
        row_height=24,
    )
    draw_section(
        c,
        category_name(categories["sides"]),
        items["sides"],
        530,
        right_y - 12,
        266,
        font_size=15,
        row_height=24,
    )
    draw_footer(c)


def draw_page_four(c, categories, items):
    draw_background(c)
    draw_page_header(c, "MAIN DISHES", 4)
    draw_crop(
        c,
        os.path.join(IMAGE_DIR, "cover-plov.webp"),
        38,
        309,
        290,
        205,
        radius=12,
        caption="PLOV",
    )
    draw_crop(
        c,
        os.path.join(IMAGE_DIR, "main-lamb.png"),
        38,
        93,
        290,
        195,
        radius=12,
        caption="LAMB NECK KEBAB",
    )
    main_items = items["c1781337286710"]
    midpoint = (len(main_items) + 1) // 2
    draw_section(
        c,
        category_name(categories["c1781337286710"]),
        main_items[:midpoint],
        362,
        500,
        206,
        font_size=12.2,
        row_height=19,
    )
    draw_section(
        c,
        "MORE MAIN DISHES",
        main_items[midpoint:],
        594,
        500,
        206,
        font_size=12.2,
        row_height=19,
    )
    draw_crop(
        c,
        os.path.join(IMAGE_DIR, "main-kazan.png"),
        362,
        88,
        206,
        178,
        radius=10,
        caption="KAZAN KEBAB",
    )
    draw_crop(
        c,
        os.path.join(IMAGE_DIR, "main-french.png"),
        594,
        88,
        206,
        178,
        radius=10,
        caption="FRENCH-STYLE BEEF",
    )
    draw_footer(c)


def draw_page_five(c, categories, items):
    draw_background(c)
    draw_page_header(c, "SALADS & DESSERTS", 5)
    draw_crop(
        c,
        os.path.join(IMAGE_DIR, "salad-caesar.png"),
        38,
        388,
        372,
        126,
        radius=10,
        caption="CAESAR SALAD",
    )
    draw_crop(
        c,
        os.path.join(IMAGE_DIR, "dessert-spartak.png"),
        432,
        388,
        372,
        126,
        radius=10,
        caption='"SPARTAK" CAKE',
    )
    draw_section(
        c,
        category_name(categories["salads"]),
        items["salads"],
        38,
        362,
        372,
        font_size=11.8,
        row_height=17.5,
    )
    draw_section(
        c,
        category_name(categories["desserts"]),
        items["desserts"],
        432,
        362,
        372,
        font_size=11.8,
        row_height=17.5,
    )
    draw_footer(c)


def draw_business_lunch(c, x, y, width, height):
    c.setFillColor(Color(0.97, 0.93, 0.84, alpha=0.88))
    c.setStrokeColor(NAVY)
    c.setLineWidth(1)
    c.roundRect(x, y, width, height, 8, stroke=1, fill=1)
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(x + 14, y + height - 22, "BUSINESS LUNCH")
    c.setFillColor(NAVY)
    c.roundRect(x + width - 100, y + height - 28, 86, 18, 9, stroke=0, fill=1)
    c.setFillColor(CREAM)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(x + width - 57, y + height - 22, "11:00-14:00")
    divider = x + 130
    c.setStrokeColor(HAIRLINE)
    c.line(divider, y + 14, divider, y + height - 40)
    c.setFillColor(RED)
    c.setFont("Neucha", 21)
    c.drawString(x + 14, y + height - 58, "SPECIAL")
    c.setFillColor(INK)
    c.setFont("Neucha", 13)
    c.drawString(x + 14, y + height - 88, "60,000 UZS")
    c.setStrokeColor(RED)
    c.setLineWidth(2)
    c.line(x + 12, y + height - 83, x + 92, y + height - 83)
    c.setFillColor(RED)
    c.setFont("Neucha", 23)
    c.drawString(x + 14, y + 32, "45,000 UZS")
    inclusions = ["First course", "Salad", "Hot dish", "Compote", "Bread"]
    c.setFillColor(INK)
    c.setFont("Neucha", 12)
    for index, inclusion in enumerate(inclusions):
        c.drawString(divider + 14, y + height - 58 - index * 20, f"+ {inclusion}")


def draw_page_six(c, categories, items):
    draw_background(c)
    draw_page_header(c, "TEA, DRINKS & BUSINESS LUNCH", 6)
    draw_photo_strip(
        c,
        [
            ("tea-raspberry.png", "RASPBERRY TEA"),
            ("coffee-cappuccino.png", "CAPPUCCINO"),
            ("bread.png", "FRESH BREAD"),
        ],
    )
    left_y = draw_section(
        c,
        category_name(categories["c1780385299367"]),
        items["c1780385299367"],
        38,
        360,
        236,
        font_size=12.5,
        row_height=18,
    )
    draw_section(
        c,
        category_name(categories["drinks"]),
        items["drinks"],
        38,
        left_y - 10,
        236,
        font_size=12.5,
        row_height=18,
    )
    middle_y = draw_section(
        c,
        category_name(categories["c1780304119652"]),
        items["c1780304119652"],
        302,
        360,
        222,
        font_size=12.5,
        row_height=18,
    )
    draw_section(
        c,
        category_name(categories["bread"]),
        items["bread"],
        302,
        middle_y - 10,
        222,
        font_size=12.5,
        row_height=18,
    )
    draw_business_lunch(c, 552, 156, 250, 204)
    c.setFillColor(NAVY)
    c.setFont("Times-Bold", 22)
    c.drawCentredString(677, 112, "2nd FLOOR")
    c.setStrokeColor(GOLD)
    c.setLineWidth(1)
    c.line(600, 99, 754, 99)
    c.setFillColor(GOLD)
    c.rect(674, 96, 6, 6, stroke=0, fill=1)
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString(677, 78, "THANK YOU FOR DINING WITH US")
    draw_footer(c)


def build_booklet():
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    register_fonts()
    categories, items = load_catalog()
    c = canvas.Canvas(OUTPUT_PATH, pagesize=(PAGE_W, PAGE_H), pageCompression=1)
    c.setTitle("Zar Kebab English Menu Booklet")
    c.setAuthor("Zar Kebab")
    c.setSubject("Six-page English restaurant menu with product photography")

    draw_cover(c)
    c.showPage()
    draw_page_two(c, categories, items)
    c.showPage()
    draw_page_three(c, categories, items)
    c.showPage()
    draw_page_four(c, categories, items)
    c.showPage()
    draw_page_five(c, categories, items)
    c.showPage()
    draw_page_six(c, categories, items)
    c.showPage()
    c.save()
    print(OUTPUT_PATH)


if __name__ == "__main__":
    build_booklet()
