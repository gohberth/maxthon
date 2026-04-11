# Menggunakan image base Python versi ringan
FROM python:3.10-slim

# Mengatur direktori kerja di dalam container
WORKDIR /app

# Menyalin seluruh berkas proyek ke direktori kerja
COPY . /app/

# Hugging Face Spaces mewajibkan aplikasi mendengarkan pada port 7860
ENV PORT=7860

# Menjamin output Python tidak di-buffer agar log bisa langsung terbaca
ENV PYTHONUNBUFFERED=1

# Menjalankan server Python bawaan kita
CMD ["python", "server.py"]
