gsap.registerPlugin(ScrollTrigger, ScrollSmoother);

const documentHeight = () => {
    const doc = document.documentElement;
    doc.style.setProperty("--doc-height", `${window.innerHeight}px`);
};

documentHeight();

window.addEventListener("load", () => {
    history.scrollRestoration = "manual";
    documentHeight();
});

window.addEventListener("resize", () => {
    documentHeight();
});
