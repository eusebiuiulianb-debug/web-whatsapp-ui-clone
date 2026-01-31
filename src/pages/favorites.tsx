import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: "/favoritos",
    permanent: false,
  },
});

export default function FavoritesRedirect() {
  return null;
}
