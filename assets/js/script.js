gsap.registerPlugin(ScrollTrigger);

const documentHeight = () => {
    const doc = document.documentElement;
    doc.style.setProperty("--doc-height", `${window.innerHeight}px`);
};

documentHeight();

window.addEventListener("load", () => {
    history.scrollRestoration = "manual";
    documentHeight();
    ScrollTrigger.refresh();
});

window.addEventListener("resize", () => {
    documentHeight();
});

/* Chapters: native scroll, brand column changes color as each chapter appears */

const chapters = gsap.utils.toArray(".chapter");
const brand = document.querySelector(".layout-brand");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const duration = reduceMotion ? 0 : 0.8;

// data-color holds "var(--color-x)": resolve it to a real color GSAP can tween
const chapterColor = (chapter) => {
    const variable = chapter.dataset.color.match(/--[\w-]+/)[0];
    return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
};

gsap.set(brand, { backgroundColor: chapterColor(chapters[0]) });

chapters.forEach((chapter) => {
    const inner = chapter.querySelector(".chapter-inner");

    ScrollTrigger.create({
        trigger: chapter,
        start: "top center",
        end: "bottom center",
        onToggle: ({ isActive }) => {
            if (!isActive) return;

            gsap.to(brand, {
                backgroundColor: chapterColor(chapter),
                duration,
                ease: "power2.inOut",
                overwrite: "auto",
            });
        },
    });

    if (!reduceMotion) {
        gsap.from(inner, {
            autoAlpha: 0,
            y: 40,
            duration: 1,
            ease: "power3.out",
            scrollTrigger: {
                trigger: chapter,
                start: "top 70%",
                toggleActions: "play none none reverse",
            },
        });
    }
});
