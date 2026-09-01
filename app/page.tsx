import { HomeForm } from "@/components/home-form";

export default function HomePage() {
  return (
    <section className="vbg-opening">
      <h1 className="vbg-display">Get seen online</h1>
      <p className="vbg-lede">
        Free step-by-step fixes in under two minutes. Listwell checks your website and local listings, then shows what to fix first.
      </p>
      <HomeForm />
    </section>
  );
}
