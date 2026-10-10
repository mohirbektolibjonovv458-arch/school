/**
 * Yuzni aniqlash va tanish — brauzerning o'zida (TensorFlow.js, face-api).
 * Kamera tasviri serverga yuborilmaydi: faqat 128 ta sondan iborat yuz vektori
 * (va sozlamaga ko'ra kichik tasdiq surati) yuboriladi.
 */
import type * as FaceApiNS from "@vladmandic/face-api";

type FaceApi = typeof FaceApiNS;
let loader: Promise<FaceApi> | null = null;

export function loadFaceApi(): Promise<FaceApi> {
  if (!loader) {
    loader = (async () => {
      const fa = await import("@vladmandic/face-api");
      const tf = fa.tf as unknown as { setBackend(b: string): Promise<boolean>; ready(): Promise<void> };
      try {
        if (!(await tf.setBackend("webgl"))) throw new Error("webgl yo'q");
      } catch {
        await tf.setBackend("cpu");
      }
      await tf.ready();
      await Promise.all([
        fa.nets.tinyFaceDetector.loadFromUri("/models"),
        fa.nets.faceLandmark68Net.loadFromUri("/models"),
        fa.nets.faceRecognitionNet.loadFromUri("/models"),
      ]);
      return fa;
    })().catch((e) => {
      loader = null;
      throw e;
    });
  }
  return loader;
}

export class CameraError extends Error {}

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!window.isSecureContext) throw new CameraError("Kamera faqat xavfsiz (https://) manzilda ishlaydi. Saytni https orqali oching.");
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError("Bu brauzer kamerani qo'llab-quvvatlamaydi. Chrome yoki Safari'ning yangi versiyasidan foydalaning.");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
  } catch (e) {
    const name = (e as Error).name;
    if (name === "NotAllowedError") throw new CameraError("Kameraga ruxsat berilmadi. Brauzer sozlamalarida kameraga ruxsat bering va sahifani yangilang.");
    if (name === "NotFoundError") throw new CameraError("Qurilmada kamera topilmadi.");
    throw new CameraError("Kamerani ochib bo'lmadi: " + (e as Error).message);
  }
  video.srcObject = stream;
  video.setAttribute("playsinline", "true");
  video.muted = true;
  await video.play();
  if (!video.videoWidth) await new Promise((r) => video.addEventListener("loadeddata", r, { once: true }));
  return stream;
}

export function stopCamera(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

export interface FaceResult {
  descriptor: Float32Array;
  box: { x: number; y: number; width: number; height: number };
  score: number;
  ear: number;          // ko'z ochiqlik koeffitsiyenti (jonlilik uchun)
  yaw: number;          // boshning chap/o'ngga burilishi (-1..1)
  count: number;        // kadrdagi yuzlar soni
  frame: { width: number; height: number };
}

type Pt = { x: number; y: number };
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
function eyeRatio(eye: Pt[]) {
  return (dist(eye[1], eye[5]) + dist(eye[2], eye[4])) / (2 * dist(eye[0], eye[3]) || 1);
}

export async function detectFace(video: HTMLVideoElement, inputSize = 320): Promise<FaceResult | null> {
  const fa = await loadFaceApi();
  if (!video.videoWidth) return null;
  const opts = new fa.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.5 });
  const all = await fa.detectAllFaces(video, opts).withFaceLandmarks().withFaceDescriptors();
  if (!all.length) return null;
  const best = all.reduce((a, b) => (a.detection.box.area > b.detection.box.area ? a : b));
  const lm = best.landmarks;
  const ear = (eyeRatio(lm.getLeftEye()) + eyeRatio(lm.getRightEye())) / 2;
  const nose = lm.getNose()[3];
  const jaw = lm.getJawOutline();
  const left = dist(nose, jaw[0]);
  const right = dist(nose, jaw[16]);
  const yaw = (right - left) / (right + left || 1);
  const b = best.detection.box;
  return {
    descriptor: best.descriptor, box: { x: b.x, y: b.y, width: b.width, height: b.height }, score: best.detection.score,
    ear, yaw, count: all.length, frame: { width: video.videoWidth, height: video.videoHeight },
  };
}

/** Yuz kadr markazida va yetarlicha katta ekanini tekshiradi */
export function faceQuality(f: FaceResult): { ok: boolean; hint: string } {
  if (f.count > 1) return { ok: false, hint: "Kadrda faqat bitta odam bo'lsin" };
  const rel = f.box.width / f.frame.width;
  if (rel < 0.18) return { ok: false, hint: "Yaqinroq keling" };
  if (rel > 0.75) return { ok: false, hint: "Biroz uzoqlashing" };
  const cx = (f.box.x + f.box.width / 2) / f.frame.width;
  const cy = (f.box.y + f.box.height / 2) / f.frame.height;
  if (Math.abs(cx - 0.5) > 0.2 || Math.abs(cy - 0.48) > 0.25) return { ok: false, hint: "Yuzingizni doira markaziga keltiring" };
  if (f.score < 0.6) return { ok: false, hint: "Yorug'roq joyda turing" };
  return { ok: true, hint: "" };
}

export function averageDescriptor(list: Float32Array[]): number[] {
  const out = new Array(128).fill(0);
  for (const d of list) for (let i = 0; i < 128; i++) out[i] += d[i];
  return out.map((v) => v / list.length);
}

export const toArray = (d: Float32Array) => Array.from(d, (v) => Math.round(v * 1e6) / 1e6);

/** Ko'z qisishni aniqlash — oddiy suratni kameraga ko'rsatib aldashga qarshi */
export class BlinkDetector {
  private open = 0;
  private closedAt = 0;
  blinked = false;
  feed(ear: number) {
    if (this.blinked) return true;
    const now = performance.now();
    if (ear > this.open * 0.92 || this.open === 0) this.open = this.open === 0 ? ear : this.open * 0.85 + ear * 0.15;
    if (this.open > 0.2 && ear < this.open * 0.72) this.closedAt = now;
    else if (this.closedAt && ear > this.open * 0.88 && now - this.closedAt < 900) this.blinked = true;
    return this.blinked;
  }
  reset() { this.open = 0; this.closedAt = 0; this.blinked = false; }
}

/** Yuz atrofidagi kichik JPEG surat (direktor tasdig'i / audit uchun) */
export function snapshot(video: HTMLVideoElement, box?: FaceResult["box"], size = 320): string {
  const canvas = document.createElement("canvas");
  let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;
  if (box) {
    const m = box.width * 0.6;
    sx = Math.max(0, box.x - m);
    sy = Math.max(0, box.y - m * 1.1);
    sw = Math.min(video.videoWidth - sx, box.width + m * 2);
    sh = Math.min(video.videoHeight - sy, box.height + m * 2.2);
  }
  const scale = size / Math.max(sw, sh);
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}
