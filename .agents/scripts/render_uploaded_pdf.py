from pathlib import Path

import fitz


pdf_path = Path("attached_assets/App_1786758491746.gdoc")
output_dir = Path(".agents/outputs/app-pdf-pages")
output_dir.mkdir(parents=True, exist_ok=True)

document = fitz.open(pdf_path)
print(f"pages={document.page_count}")
print(f"metadata={document.metadata}")

for index, page in enumerate(document):
    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    output_path = output_dir / f"page-{index + 1:02d}.png"
    pixmap.save(output_path)
    text = page.get_text("text").strip().replace("\n", " | ")
    print(f"page={index + 1} size={page.rect.width:.0f}x{page.rect.height:.0f} text={text[:240]}")