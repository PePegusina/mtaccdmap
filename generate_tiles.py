from PIL import Image
import os


def generate_tiles(image_path, output_dir, tile_size=256):
    """Нарезает изображение на тайлы для Leaflet"""
    img = Image.open(image_path)
    width, height = img.size

    # Создаем директорию для тайлов
    os.makedirs(output_dir, exist_ok=True)

    # Генерируем 4 уровня зума (0-3)
    for zoom in range(4):
        zoom_dir = os.path.join(output_dir, str(zoom))
        os.makedirs(zoom_dir, exist_ok=True)

        # Размер изображения на текущем уровне зума
        current_width = width // (2 ** (3 - zoom))
        current_height = height // (2 ** (3 - zoom))
        resized = img.resize((current_width, current_height), Image.Resampling.LANCZOS)

        # Нарезаем на тайлы
        for x in range(0, current_width, tile_size):
            x_dir = os.path.join(zoom_dir, str(x // tile_size))
            os.makedirs(x_dir, exist_ok=True)

            for y in range(0, current_height, tile_size):
                # Вырезаем тайл
                box = (x, y, min(x + tile_size, current_width), min(y + tile_size, current_height))
                tile = resized.crop(box)

                # Сохраняем
                tile_path = os.path.join(x_dir, f"{y // tile_size}.png")
                tile.save(tile_path, optimize=True)

    print(f"Тайлы созданы в {output_dir}")


if __name__ == "__main__":
    # Укажи путь к твоей карте
    generate_tiles("map.png", "tiles")