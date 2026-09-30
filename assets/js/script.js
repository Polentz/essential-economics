gsap.registerPlugin(ScrollTrigger, ScrollSmoother, Observer);

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
    gsap.set(chaptersTrack, { y: -chapters[currentIndex].offsetTop });
});

/* Chapters: one chapter per scroll gesture, brand column changes color */

const content = document.querySelector(".layout__content");
const chaptersTrack = document.querySelector(".chapters");
const chapters = gsap.utils.toArray(".chapter");
const brand = document.querySelector(".layout__brand");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const duration = reduceMotion ? 0 : 1;

let currentIndex = 0;
let animating = false;

// data-color holds "var(--color-x)": resolve it to a real color GSAP can tween
const chapterColor = (chapter) => {
    const variable = chapter.dataset.color.match(/--[\w-]+/)[0];
    return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
};

const goToChapter = (index) => {
    index = gsap.utils.clamp(0, chapters.length - 1, index);
    if (index === currentIndex || animating) return;

    animating = true;
    currentIndex = index;

    gsap.timeline({
        defaults: { duration, ease: "power3.inOut", overwrite: "auto" },
        // short cooldown so trackpad inertia doesn't trigger a second jump
        onComplete: () => gsap.delayedCall(0.2, () => (animating = false)),
    })
        .to(chaptersTrack, { y: -chapters[index].offsetTop }, 0)
        .to(brand, { backgroundColor: chapterColor(chapters[index]) }, 0)
        .fromTo(
            chapters[index].querySelector(".chapter__inner"),
            { autoAlpha: 0, y: 40 },
            { autoAlpha: 1, y: 0, ease: "power3.out" },
            duration * 0.4
        );
};

gsap.set(brand, { backgroundColor: chapterColor(chapters[0]) });

Observer.create({
    target: window,
    type: "wheel,touch",
    wheelSpeed: -1,
    tolerance: 10,
    preventDefault: true,
    onUp: () => goToChapter(currentIndex + 1),
    onDown: () => goToChapter(currentIndex - 1),
});

window.addEventListener("keydown", (event) => {
    if (event.target.closest("input, textarea, select, button")) return;

    const keys = {
        ArrowDown: currentIndex + 1,
        PageDown: currentIndex + 1,
        " ": currentIndex + 1,
        ArrowUp: currentIndex - 1,
        PageUp: currentIndex - 1,
        Home: 0,
        End: chapters.length - 1,
    };

    if (event.key in keys) {
        event.preventDefault();
        goToChapter(keys[event.key]);
    }
});

// Keyboard users tabbing into another chapter: bring that chapter into view
content.addEventListener("focusin", (event) => {
    content.scrollTop = 0;
    const index = chapters.indexOf(event.target.closest(".chapter"));
    if (index !== -1 && index !== currentIndex) {
        animating = false;
        goToChapter(index);
    }
});
