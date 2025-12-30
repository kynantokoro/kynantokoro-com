import { Outlet } from "react-router";
import Footer from "../components/Footer";
import { FooterMarginProvider } from "../contexts/footer-margin-context";

export default function IndexLayout() {
  return (
    <FooterMarginProvider>
      <main>
        <Outlet />
      </main>
      <Footer />
    </FooterMarginProvider>
  );
}