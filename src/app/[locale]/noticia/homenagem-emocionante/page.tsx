import Image from "next/image";
import { Link } from "~/i18n/navigation";
import { ShareButtons } from "~/components/advertorial/share-buttons";
import { DynamicDate } from "~/components/advertorial/dynamic-date";
import { Instagram } from "lucide-react";

export const metadata = {
    title: "Impossível não se emocionar: A homenagem de neto que quebrou a internet hoje.",
    description: "Vídeo de avó de 86 anos ouvindo música personalizada feita pelo neto viraliza e comove redes sociais.",
};

export default function HomenagemEmocionantePage() {
    return (
        <div className="min-h-screen bg-white font-sans text-[#333]">
            {/* G1-style Header */}
            <header className="bg-[#C4170C] text-white relative">
                <div className="max-w-[1240px] mx-auto px-4 h-12 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="font-bold text-2xl tracking-tighter">h1</div>
                        <span className="text-xs uppercase font-bold hidden sm:block">Tecnologia e Família</span>
                    </div>

                    {/* Mobile Center Title */}
                    <div className="absolute left-1/2 -translate-x-1/2 sm:hidden font-bold uppercase text-sm">
                        FAMÍLIA
                    </div>

                    <div className="text-xs gap-4 hidden sm:flex">
                        <span className="cursor-pointer hover:underline">ENTRAR</span>
                        <span className="cursor-pointer hover:underline">🔍</span>
                    </div>
                </div>
            </header>

            {/* Subheader */}
            <div className="bg-[#C4170C] text-white/90 text-sm hidden md:block">
                <div className="max-w-[1240px] mx-auto px-4 py-1 flex gap-6">
                    <span className="hover:text-white cursor-pointer">agro</span>
                    <span className="hover:text-white cursor-pointer">bem estar</span>
                    <span className="hover:text-white cursor-pointer">carros</span>
                    <span className="hover:text-white cursor-pointer">ciência</span>
                    <span className="hover:text-white cursor-pointer">economia</span>
                    <span className="hover:text-white cursor-pointer">mundo</span>
                    <span className="hover:text-white cursor-pointer">tecnologia</span>
                </div>
            </div>

            <main className="max-w-[1100px] mx-auto px-4 py-8 md:flex gap-8">

                {/* Main Content */}
                <div className="flex-1 max-w-[780px]">
                    <h1 className="text-[32px] md:text-[42px] font-bold leading-tight mb-4 text-[#1A1A1A]">
                        Impossível não se emocionar: A homenagem criativa de neto que quebrou a internet hoje.
                    </h1>
                    <h2 className="text-lg md:text-xl text-[#555] mb-6 font-light leading-snug">
                        Vídeo de avó de 86 anos ouvindo música personalizada feita pelo neto viraliza e comove redes sociais. História de superação e amor familiar é o tema da canção.
                    </h2>

                    <div className="flex items-center gap-4 text-xs text-[#555] border-t border-b border-[#4A8E9A]/10 py-3 mb-8">
                        <div>
                            Por <span className="text-[#C4170C] font-bold">Redação Tecnologia</span>
                        </div>
                        <div className="hidden sm:block">
                            <DynamicDate /> • Atualizado há 15 minutos
                        </div>
                    </div>

                    <ShareButtons />

                    <p className="mb-6 font-medium text-lg">
                        Imagine ter sua trajetória de vida transformada em um samba inesquecível. Foi essa a surpresa que emocionou a internet: o momento exato em que Dona Elisa, de 86 anos, moradora de Brasília-DF, ouve pela primeira vez a canção criada exclusivamente para ela pelo neto. Aumente o som, dê o play e prepare o lencinho para assistir à reação genuína desse "coração de ouro":
                    </p>

                    <div className="mb-8 relative rounded-lg overflow-hidden bg-black">
                        <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
                            <iframe
                                src="https://www.youtube.com/embed/jxNx4e5bu3E"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                                frameBorder="0"
                                className="absolute inset-0 h-full w-full"
                                title="Homenagem do neto para avo Elisa"
                            />
                        </div>
                    </div>
                    <p className="text-sm text-[#1A1A2E]/50 text-center italic mt-[-20px] mb-8">
                        Homenagem do neto Thiago para avó Elisa Pereira de Barros
                    </p>

                    <article className="prose prose-lg text-[#333] max-w-none">
                        <p className="mb-6">
                            Uma cena simples, em volta de uma mesa de almoço, capturou o coração de milhares de internautas nesta manhã. No vídeo, Dona Elisa, uma senhora de 86 anos, é surpreendida por uma canção que narra a sua própria vida. Mas não é uma música qualquer: é um samba, ritmo que ela ama, com uma letra que parece ter saído das páginas de um diário secreto da família.
                        </p>

                        <p className="mb-6">
                            O presente foi idealizado pelo neto, que utilizou um serviço inovador chamado <Link href="/" className="text-[#C4170C] font-bold hover:underline">Apollo Song</Link> para transformar a biografia da avó em obra de arte. E que biografia!
                        </p>

                        <h3 className="text-2xl font-bold text-[#1A1A1A] mt-8 mb-4">Punho de Ferro e Tempero</h3>
                        <p className="mb-6">
                            A letra da canção nos transporta para o Espírito Santo de 1939, onde "nasceu a estrela". A história dessa capixaba é a de muitas matriarcas brasileiras: saiu do zero, estudou e batalhou. Aos 30 anos, separada num tempo em que isso era tabu, ela não se encolheu. Passou em concurso, conquistou sua independência e "venceu o destino".
                        </p>

                        <p className="mb-6">
                            Quem a vê hoje, organizando suas aulas de pilates e exigindo tudo no lugar, mal imagina os espinhos que encontrou no caminho. A perda do filho Joaquim, de Dadá e da própria mãe poderiam ter endurecido seu coração. Mas Elisa, descrita como "o prumo da união", escolheu plantar carinho.
                        </p>

                        {/* Instagram Highlight Section */}
                        <div className="my-10 bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045] p-[2px] rounded-xl shadow-lg transform hover:scale-[1.01] transition-transform duration-300">
                            <div className="bg-white rounded-[10px] p-6 text-center">
                                <div className="flex justify-center mb-4">
                                    <Instagram size={48} className="text-[#E1306C]" />
                                </div>
                                <h3 className="text-xl font-bold text-gray-900 mb-2">
                                    Acompanhe mais histórias emocionantes
                                </h3>
                                <p className="text-[#1A1A2E]/60 mb-6">
                                    Siga a Apollo Song no Instagram e veja centenas de outras reações de amor.
                                </p>
                                <a
                                    href="https://www.instagram.com/apollosongbr"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 bg-[#E1306C] text-white font-bold py-3 px-8 rounded-full hover:bg-[#C13584] transition-colors shadow-md text-lg"
                                >
                                    <Instagram size={20} />
                                    Seguir @apollosongbr
                                </a>
                            </div>
                        </div>

                        <p className="mb-8 font-bold text-xl text-[#333]">
                            Agora é a sua vez de emocionar quem você ama.
                        </p>
                        <div className="my-8 text-center">
                            <Link
                                href="/"
                                className="inline-block bg-[#00a859] hover:bg-[#008f4c] text-white font-bold py-3 px-6 rounded text-lg transition-colors shadow-md"
                            >
                                QUERO UMA MÚSICA PARA UM ENTE QUERIDO &raquo;
                            </Link>
                        </div>

                        <h3 className="text-2xl font-bold text-[#1A1A1A] mt-8 mb-4">"Dá um Big Mac pra ela..."</h3>
                        <p className="mb-6">
                            O refrão da música, que já virou chiclete nas redes, revela o lado leve dessa guerreira. Deixa de lado a pose séria: o negócio dela é um Big Mac, um chopp gelado e samba no pé.
                        </p>
                        <p className="mb-6">
                            <span className="italic text-[#1A1A2E]/60 block pl-4 border-l-4 border-[#C4170C] my-4">
                                "Elisa guerreira, o nosso maior legado / Coração de ouro que o mundo deixou florido"
                            </span>
                            Canta a voz potente na gravação, enquanto o vídeo mostra Elisa inicialmente confusa, depois reconhecendo as referências — os quatro filhos (Leila, Kléber, Christiano e a saudade de Kátia, que infelizmente nos deixou vítima de um câncer de fígado), o amor de quase 30 anos com Jairo, e até sua batalha recente contra um câncer de pulmão ("pulmão de aço").
                        </p>

                        <div className="bg-[#1DB954]/10 border border-[#1DB954]/20 p-4 rounded-lg my-8 flex items-center gap-4 hover:shadow-md transition-shadow">
                            <div className="text-[#1DB954] shrink-0">
                                <svg width="48" height="48" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141 4.38-1.38 9.781-.659 13.439 1.56.42.24.6.84.302 1.26zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.4-1.02 15.6 1.44.6.36.84 1.14.479 1.74-.3.6-1.139.84-1.499.3z" />
                                </svg>
                            </div>
                            <div>
                                <div className="font-bold text-[#1A1A1A] text-sm md:text-base">Sucesso no Streaming</div>
                                <p className="text-xs md:text-sm mb-1 text-[#1A1A2E]/60">
                                    A música fez tanto sucesso que foi parar até no Spotify! Ouça o "Samba da Vó Elisa":
                                </p>
                                <a href="https://open.spotify.com/album/4RxL0xBvi7nYlhPERD8T3O?si=d5ArqLD3RGyy9_O0s_MZhA&nd=1&dlsi=11d2bc3092b34891" target="_blank" rel="noopener noreferrer" className="text-[#1DB954] font-bold text-xs md:text-sm hover:underline flex items-center gap-1">
                                    OUVIR AGORA <span aria-hidden="true">&rarr;</span>
                                </a>
                            </div>
                        </div>

                        <h3 className="text-2xl font-bold text-[#1A1A1A] mt-8 mb-4">Como a Mágica Aconteceu?</h3>
                        <p className="mb-6">
                            O segredo por trás da homenagem é a <strong>Apollo Song</strong>, uma plataforma que une composição profissional e tecnologia para criar músicas exclusivas a partir de histórias reais.
                        </p>
                        <p className="mb-6">
                            Diferente de paródias ou músicas genéricas, o serviço cria melodias originais em diversos estilos — do Gospel ao Sertanejo, e claro, o Samba de Roda que Elisa tanto ama.
                        </p>

                        <div className="bg-[#f7f7f7] border border-[#ddd] p-6 rounded-lg my-8 md:my-12">
                            <h4 className="text-xl font-bold mb-2">Quer fazer uma homenagem igual?</h4>
                            <p className="mb-4 text-sm">
                                O processo é simples: você conta a história, escolhe o estilo musical e recebe uma música completa, com qualidade de estúdio (letra, melodia e voz), pronta para emocionar quem você ama.
                            </p>
                            <Link
                                href="/"
                                className="inline-block w-full text-center bg-[#00a859] hover:bg-[#008f4c] text-white font-bold py-4 px-8 rounded text-lg transition-colors uppercase tracking-wide shadow-lg"
                            >
                                CRIAR MÚSICA PARA UM ENTE QUERIDO AGORA &raquo;
                            </Link>
                            <p className="text-center text-xs text-[#1A1A2E]/50 mt-2">
                                Promoção por tempo limitado. Satisfação garantida.
                            </p>
                        </div>
                    </article>

                    <hr className="my-8" />

                    <div className="text-sm font-bold text-[#C4170C] mb-2 uppercase">Mais sobre Tecnolodia</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-white/30 p-4 rounded hover:bg-white/60 cursor-pointer transition">
                            <div className="text-[#C4170C] text-xs font-bold mb-1">Inovação</div>
                            <div className="font-semibold text-[#333]">Como a tecnologia está ajudando famílias a preservarem memórias</div>
                        </div>
                        <div className="bg-white/30 p-4 rounded hover:bg-white/60 cursor-pointer transition">
                            <div className="text-[#C4170C] text-xs font-bold mb-1">Viral</div>
                            <div className="font-semibold text-[#333]">5 presentes criativos que fogem do óbvio em 2026</div>
                        </div>
                    </div>
                </div>

                {/* Sidebar */}
                <aside className="w-full md:w-[300px] mt-8 md:mt-0">
                    <div className="sticky top-4">
                        <div className="mb-6">
                            <div className="text-sm font-bold text-[#333] border-b-2 border-[#C4170C] mb-4 pb-1 uppercase inline-block">
                                Mais Lidas
                            </div>
                            <ul className="space-y-4">
                                <li className="flex gap-4 group cursor-pointer">
                                    <span className="text-3xl font-bold text-[#e5e5e5] group-hover:text-[#C4170C]">1</span>
                                    <div className="text-sm text-[#333] group-hover:text-[#C4170C]">
                                        Presente de neto faz avó chorar e vídeo bate 1 milhão de views
                                    </div>
                                </li>
                                <li className="flex gap-4 group cursor-pointer">
                                    <span className="text-3xl font-bold text-[#e5e5e5] group-hover:text-[#C4170C]">2</span>
                                    <div className="text-sm text-[#333] group-hover:text-[#C4170C]">
                                        Conheça a tecnologia por trás das músicas personalizadas
                                    </div>
                                </li>
                                <li className="flex gap-4 group cursor-pointer">
                                    <span className="text-3xl font-bold text-[#e5e5e5] group-hover:text-[#C4170C]">3</span>
                                    <div className="text-sm text-[#333] group-hover:text-[#C4170C]">
                                        O poder da música na preservação da memória de idosos
                                    </div>
                                </li>
                            </ul>
                        </div>

                        <div className="bg-white/60 p-4 rounded text-center">
                            <div className="text-xs font-bold text-[#1A1A2E]/40 uppercase tracking-widest mb-2">Publicidade</div>
                            <div className="bg-white border border-[#4A8E9A]/20 p-4 rounded shadow-sm">
                                <div className="font-serif text-xl italic text-[#1A1A2E] mb-2">Apollo Song</div>
                                <p className="text-xs text-[#1A1A2E]/60 mb-4">Transforme sua história em música hoje mesmo.</p>
                                <Link href="/" className="block bg-[#25d366] text-white text-xs font-bold py-2 px-4 rounded hover:bg-[#128c7e] transition">
                                    Falar com Atendente
                                </Link>
                            </div>
                        </div>
                    </div>
                </aside>

            </main>

            <footer className="bg-[#C4170C] text-white py-8 mt-12 text-center text-sm">
                <div className="max-w-[1240px] mx-auto px-4">
                    <p className="mb-4">&copy; 2026 Notícias Tecnologia e Família. Todos os direitos reservados.</p>
                    <p className="text-xs text-white/70 max-w-[800px] mx-auto">
                        Este site não faz parte do site do Google, Facebook ou Meta. Além disso, este site não é endossado pelo Google, Facebook ou G1 em qualquer aspecto. Google, Facebook e G1 são marcas comerciais de suas respectivas empresas. Este é um site independente de notícias e entretenimento.
                    </p>
                </div>
            </footer>
        </div>
    );
}
