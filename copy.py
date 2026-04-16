import requests

url = "https://aspaltvpasti.top/xxx/merah.php"

headers = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://aspaltvpasti.top",
    "Origin": "https://aspaltvpasti.top"
}

try:
    response = requests.get(url, headers=headers, timeout=10)

    if response.status_code == 200:
        content = response.text

        # Simpan ke file
        with open("output.html", "w", encoding="utf-8") as f:
            f.write(content)

        print("Berhasil disimpan ke output.html")
    else:
        print(f"Gagal. Status code: {response.status_code}")

except Exception as e:
    print("Error:", e)
