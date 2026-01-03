import { Outlet } from "react-router";
import Footer from "../components/Footer";

export default function IndexLayout() {
  return (
    <>
      <main>
        <Outlet />
      </main>
      <Footer />
    </>
  );
}