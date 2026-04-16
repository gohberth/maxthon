from playwright.sync_api import sync_playwright

url = "https://aspaltvpasti.top/xxx/merah.php"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page()

    # buka halaman utama dulu (biar dapet session/cookie)
    page.goto("https://aspaltvpasti.top/", timeout=60000)

    # baru buka target
    page.goto(url, timeout=60000)
    page.wait_for_timeout(10000)  # tunggu 10 detik

    # ambil isi HTML
    content = page.content()

    with open("output.html", "w", encoding="utf-8") as f:
        f.write(content)

    print("Berhasil ambil konten!")

    browser.close()
