import { Service, inject, signal } from '@angular/core';
import { MediaFiles } from '../media-files/media-files';

@Service()
export class TextSegmentationService {
    private mediaFilesService = inject(MediaFiles);

    public segments = signal<TextSegment[]>([]);

    constructor() {
        // STUB: Segmentation to be called when a new text record is added.
        this.segmentText();
    }

    // STUB: Text segmentation to be implemented in the next iteration. For now, segments for the requirements
    // specification document are hardcoded here.
    public segmentText(): void {
        this.segments.set([
            { id: this.generateSegmentId(), text: 'Especificação de Requisitos', linked: false },
            { id: this.generateSegmentId(), text: 'Introdução', linked: false },
            { id: this.generateSegmentId(), text: 'Este documento tem como objetivo especificar os requisitos funcionais e não funcionais da ferramenta para criação de livros híbridos desenvolvida no contexto do projeto ÆMIA. O propósito deste documento é mapear o que deverá atendido para a funcionalidade efetiva da ferramenta, idealmente em estágio prévio ao início do desenvolvimento.', linked: false },
            { id: this.generateSegmentId(), text: 'Em um momento posterior serão adicionados a este documento as validações dos diversos requisitos conforme o estágio de desenvolvimento requerer que eles sejam atendidos.', linked: false },
            { id: this.generateSegmentId(), text: 'Escopo', linked: false },
            { id: this.generateSegmentId(), text: 'Este documento descreve os requisitos da ferramenta de criação, que receberá arquivos de vídeo e áudio, registros de texto e opcionalmente arquivos de anotação e gerará um arquivo portátil contendo o livro híbrido criado.', linked: false },
            { id: this.generateSegmentId(), text: 'Não estão incluídos neste documento os requisitos do visualizador de livros híbridos, de ferramentas de software para preparo dos arquivos de livro híbrido para distribuição para uso com o visualizador e da plataforma unificada que unirá a criação, curadoria e distribuição de livros híbridos.', linked: false },
            { id: this.generateSegmentId(), text: 'Siglas, termos e abreviações', linked: false },
            { id: this.generateSegmentId(), text: '•', linked: true },
            { id: this.generateSegmentId(), text: ' RF: Requisito Funcional', linked: false },
            { id: this.generateSegmentId(), text: '•', linked: true },
            { id: this.generateSegmentId(), text: ' RNF: Requisito Não Funcional', linked: false },
            { id: this.generateSegmentId(), text: '•', linked: true },
            { id: this.generateSegmentId(), text: ' MP4:', linked: true },
            { id: this.generateSegmentId(), text: ' MPEG', linked: true },
            { id: this.generateSegmentId(), text: '-', linked: true },
            { id: this.generateSegmentId(), text: '4 Part 14', linked: false },
            { id: this.generateSegmentId(), text: '•', linked: true },
            { id: this.generateSegmentId(), text: ' H.264', linked: true },
            { id: this.generateSegmentId(), text: ':', linked: true },
            { id: this.generateSegmentId(), text: ' Advanced Video Coding', linked: true },
            { id: this.generateSegmentId(), text: ' (ITU', linked: true },
            { id: this.generateSegmentId(), text: '-', linked: true },
            { id: this.generateSegmentId(), text: 'T H.264)', linked: false },
            { id: this.generateSegmentId(), text: '•', linked: true },
            { id: this.generateSegmentId(), text: ' H.', linked: true },
            { id: this.generateSegmentId(), text: '265', linked: true },
            { id: this.generateSegmentId(), text: ':', linked: true },
            { id: this.generateSegmentId(), text: ' High Efficiency Video Coding (ITU', linked: true },
            { id: this.generateSegmentId(), text: '-', linked: true },
            { id: this.generateSegmentId(), text: 'T H.265)', linked: false },
            { id: this.generateSegmentId(), text: '•', linked: true },
            { id: this.generateSegmentId(), text: ' VP9', linked: true },
            { id: this.generateSegmentId(), text: ':', linked: true },
            { id: this.generateSegmentId(), text: ' Video Processing 9', linked: false },
            { id: this.generateSegmentId(), text: '•', linked: true },
            { id: this.generateSegmentId(), text: ' AV1', linked: true },
            { id: this.generateSegmentId(), text: ':', linked: true },
            { id: this.generateSegmentId(), text: ' AOMedia Video 1', linked: false },
            { id: this.generateSegmentId(), text: '•', linked: true },
            { id: this.generateSegmentId(), text: ' PDF:', linked: true },
            { id: this.generateSegmentId(), text: ' Portable Document Format', linked: false },
            { id: this.generateSegmentId(), text: '•', linked: true },
            { id: this.generateSegmentId(), text: ' MC:', linked: true },
            { id: this.generateSegmentId(), text: ' Marked Content', linked: false },
            { id: this.generateSegmentId(), text: '•', linked: true },
            { id: this.generateSegmentId(), text: ' MDN:', linked: true },
            { id: this.generateSegmentId(), text: ' MDN Web Docs', linked: false },
            { id: this.generateSegmentId(), text: '•', linked: true },
            { id: this.generateSegmentId(), text: ' HTTP:', linked: true },
            { id: this.generateSegmentId(), text: ' Hyper', linked: true },
            { id: this.generateSegmentId(), text: 'T', linked: true },
            { id: this.generateSegmentId(), text: 'ext', linked: true },
            { id: this.generateSegmentId(), text: ' Transfer Protocol', linked: false },
            { id: this.generateSegmentId(), text: '•', linked: true },
            { id: this.generateSegmentId(), text: ' MVP: Produto Mínimo Viável', linked: false },
            { id: this.generateSegmentId(), text: 'Requisitos Funcionais (RF)', linked: false },
            { id: this.generateSegmentId(), text: 'RF1', linked: true },
            { id: this.generateSegmentId(), text: 'Criação de arquivo único de saída. A ferramenta deverá, ao fim da utilização conceitual, exportar um arquivo de saída único contendo os arquivos necessários para a representação do livro híbrido. Este arquivo', linked: true },
            { id: this.generateSegmentId(), text: 'deverá conter as mídias utilizadas, o registro de texto e dados estruturados que representem o livro híbrido a partir destes registros.', linked: false },
            { id: this.generateSegmentId(), text: 'RF2', linked: true },
            { id: this.generateSegmentId(), text: 'Entrada de arquivos de vídeo. A ferramenta deverá tentar ser agnóstica à medida do possível a formatos desconhecidos de vídeo desde que suportados pelo navegador do usuário e possuir suporte a arquivos de vídeo em formato MP4 codificados com H.264, H.265, VP9 e AV1 sempre que suportados pelo navegador do usuário.', linked: false },
            { id: this.generateSegmentId(), text: 'RF3', linked: true },
            { id: this.generateSegmentId(), text: 'Entrada de arquivos PDF. A ferramenta deverá ser capaz de processar arquivos em formato PDF para o registro de texto. O PDF deverá possuir MC com granularidade suficiente para permitir a seleção de parágrafos e outros elementos ancorados a segmentos de vídeos de sinalização.', linked: false },
            { id: this.generateSegmentId(), text: 'RF4', linked: true },
            { id: this.generateSegmentId(), text: 'Segmentação parcialmete automatizada. A ferramenta deverá ser capaz segmentar automaticamente vídeos de sinalização a partir de técnicas de visão computacional. A segmentação automática poderá ser propensa a falhas devido à natureza imperfeita destas técnicas.', linked: false },
            { id: this.generateSegmentId(), text: 'RF5', linked: true },
            { id: this.generateSegmentId(), text: 'Correção manual da segmentação parcialmente automatizada. A ferramenta deverá permitir a correção manual da segmentação automatizada descrita no', linked: true },
            { id: this.generateSegmentId(), text: ' RF4', linked: true },
            { id: this.generateSegmentId(), text: ', permitindo a eliminação de segmentos, criação de segmentos, união de segmentos, divisão de segmentos e ajuste de bordas de segmentos.', linked: false },
            { id: this.generateSegmentId(), text: 'RF6', linked: true },
            { id: this.generateSegmentId(), text: 'Ancoragem parcialmente automatizada. A ferramenta deverá ser capaz associar automaticamente segmentos de vídeos a passagens de texto a partir de técnicas de visão computacional e processamento de linguagem natural. A ancoragem automática poderá ser propensa a falhas devido à natureza imperfeita destas técnicas.', linked: false },
            { id: this.generateSegmentId(), text: 'RF7', linked: true },
            { id: this.generateSegmentId(), text: 'Correção manual da ancoragem parcialmente automatizada. A ferramenta deverá permitir a correção manual da ancoragem automatizada descrita no', linked: true },
            { id: this.generateSegmentId(), text: ' RF6', linked: true },
            { id: this.generateSegmentId(), text: ', permitindo a reassociação de segmentos associados, associação de segmentos não associados e a desassociação de segmentos associados.', linked: false },
            { id: this.generateSegmentId(), text: 'RF8', linked: true },
            { id: this.generateSegmentId(), text: 'Compatibilidade com ELAN. A ferramenta deverá ser capaz de receber, juntamente aos arquivos de vídeo, arquivos de anotação do ELAN e extrair suas informações de segmentação.', linked: false },
            { id: this.generateSegmentId(), text: 'Requisitos Não Funcionais (RNF)', linked: false },
            { id: this.generateSegmentId(), text: 'RNF1', linked: true },
            { id: this.generateSegmentId(), text: 'Compatibilidade com navegadores modernos. A ferramenta deverá ser accessível em um endereço da web e funcionar em navegadores com suporte a recursos modernos, requerendo apenas recursos com disponibilidade classificada como Baseline no MDN. Outros recursos podem ser utilizados desde que não sejam essenciais para a utilização básica da ferramenta.', linked: false },
            { id: this.generateSegmentId(), text: 'RNF2', linked: true },
            { id: this.generateSegmentId(), text: 'Intuitividade. A ferramenta deverá apresentar interface de usuário intuitiva permitindo seu uso por usuários expostos a apenas um breve tutorial sobre seus conceitos e utilização.', linked: false },
            { id: this.generateSegmentId(), text: 'RNF3', linked: true },
            { id: this.generateSegmentId(), text: 'Automatização não disruptiva. As automatizações descritas em', linked: true },
            { id: this.generateSegmentId(), text: 'RF4', linked: true },
            { id: this.generateSegmentId(), text: ' e', linked: true },
            { id: this.generateSegmentId(), text: ' RF6', linked: true },
            { id: this.generateSegmentId(), text: ' deverão pertencer naturalmente ao fluxo de trabalho da ferramenta, agindo de forma intuitiva e de forma a fazer com que as correções manuais descritas em', linked: true },
            { id: this.generateSegmentId(), text: ' RF5', linked: true },
            { id: this.generateSegmentId(), text: ' e', linked: true },
            { id: this.generateSegmentId(), text: ' RF7', linked: true },
            { id: this.generateSegmentId(), text: ' ocorram da mesma forma como seriam feitos os processos de segmentação e ancoragem de forma manual.', linked: false },
            { id: this.generateSegmentId(), text: 'RNF4', linked: true },
            { id: this.generateSegmentId(), text: 'Requisitos de hardware. A ferramenta deverá ser compatível com computadores pessoais de baixo desempenho capazes de executar um navegador moderno. As automatizações descritas em', linked: true },
            { id: this.generateSegmentId(), text: ' RF4', linked: true },
            { id: this.generateSegmentId(), text: ' e', linked: true },
            { id: this.generateSegmentId(), text: ' RF6', linked: true },
            { id: this.generateSegmentId(), text: ' e eventuais outras automatizações a serem adicionadas deverão ter individualmente um tempo de execução em um notebook LG Gram 15Z90N não superior a duas vezes a duração dos vídeos.', linked: false },
            { id: this.generateSegmentId(), text: 'RNF5', linked: true },
            { id: this.generateSegmentId(), text: 'Hospedagem estática. A ferramenta deverá ser hospedada de forma estática em um servidor HTTP sem a necessidade de um backend para processamento de suas funcionalidades.', linked: false },
            { id: this.generateSegmentId(), text: 'RNF6', linked: true },
            { id: this.generateSegmentId(), text: 'Auto hospedagem. A ferramenta deverá ser disponibilizada de forma a permitir sua auto hospedagem por outros indivíduos e organizações sem prejuízo significativo a sua utilização.', linked: false },
            { id: this.generateSegmentId(), text: 'RNF7', linked: true },
            { id: this.generateSegmentId(), text: 'Custo zero de licenciamento de software e tecnologia. A ferramenta deverá depender exclusivamente de software livre e padrões livres de custo de licenciamento, de forma a permitir a abertura do código fonte do software sem custos de licenciamento aos usuários.', linked: false },
            { id: this.generateSegmentId(), text: 'RNF8', linked: true },
            { id: this.generateSegmentId(), text: 'Acessibilidade básica. A Ferramenta deverá atender aos requisitos exigidos pela norma NBR 17225 em nível de conformidade AA.', linked: false },
            { id: this.generateSegmentId(), text: 'RNF9', linked: true },
            { id: this.generateSegmentId(), text: 'Acessibilidade plena. A ferramenta deverá atingir nível de conformidade AAA da NBR 17225 e implementar outras práticas que promovam acessibilidade plena a quase todos os potenciais usuários.', linked: false },
            { id: this.generateSegmentId(), text: 'RNF10', linked: true },
            { id: this.generateSegmentId(), text: 'Privacidade. A Ferramenta não deverá se comunicar com qualquer serviço externo a sua hospedagem de forma a revelar informações sobre a sua utilização. A ferramenta não deverá se comunicar automaticamente com qualquer serviço hospedado por nós quando utilizada de forma auto hospedada.', linked: false },
            { id: this.generateSegmentId(), text: 'RNF11', linked: true },
            { id: this.generateSegmentId(), text: 'Manutenibilidade. A Ferramenta deverá ser desenvolvida de forma modular e clara, permitindo alterações futuras e contribuições de terceiros.', linked: false },
            { id: this.generateSegmentId(), text: 'Priorização dos requisitos funcionais', linked: false },
            { id: this.generateSegmentId(), text: 'Essenciais:', linked: true },
            { id: this.generateSegmentId(), text: ' RF1', linked: true },
            { id: this.generateSegmentId(), text: ',', linked: true },
            { id: this.generateSegmentId(), text: ' RF2', linked: true },
            { id: this.generateSegmentId(), text: ' e', linked: true },
            { id: this.generateSegmentId(), text: ' RF3', linked: true },
            { id: this.generateSegmentId(), text: 'são essenciais para a utilização da ferramenta em qualquer contexto. Um MVP deverá obrigatoriamente atendê-los, pois sem eles não há qualquer utilidade na ferramenta.', linked: false },
            { id: this.generateSegmentId(), text: 'Desejáveis:', linked: true },
            { id: this.generateSegmentId(), text: ' RF4', linked: true },
            { id: this.generateSegmentId(), text: ', a segmentação parcialmente automatizada, é um recurso importante para justificar a existência da ferramenta dentro do contexto da pesquisa sendo realizada, se ele for atendido deverá obrigatoriamente também ser atendido o', linked: true },
            { id: this.generateSegmentId(), text: ' RF5', linked: true },
            { id: this.generateSegmentId(), text: '.', linked: false },
            { id: this.generateSegmentId(), text: 'Futuros:', linked: true },
            { id: this.generateSegmentId(), text: ' RF6', linked: true },
            { id: this.generateSegmentId(), text: ' e', linked: true },
            { id: this.generateSegmentId(), text: ' RF7', linked: true },
            { id: this.generateSegmentId(), text: 'dependem de pesquisa substancial a ser realizada, e só poderão ser atendidos quando essas pesquisas tiverem dado resultados satisfatórios.', linked: true },
            { id: this.generateSegmentId(), text: ' RF8', linked: true },
            { id: this.generateSegmentId(), text: 'é relativo a um fluxo de trabalho alternativo que provavelmente pouco comum, assim poderá ser deixado para um momento oportuno.', linked: false },
            { id: this.generateSegmentId(), text: 'Priorização dos requisitos não funcionais', linked: false },
            { id: this.generateSegmentId(), text: 'Essenciais:', linked: true },
            { id: this.generateSegmentId(), text: ' RNF1', linked: true },
            { id: this.generateSegmentId(), text: ',', linked: true },
            { id: this.generateSegmentId(), text: ' RNF5', linked: true },
            { id: this.generateSegmentId(), text: ',', linked: true },
            { id: this.generateSegmentId(), text: ' RNF6', linked: true },
            { id: this.generateSegmentId(), text: ' e', linked: true },
            { id: this.generateSegmentId(), text: ' RNF7', linked: true },
            { id: this.generateSegmentId(), text: 'são requisitos básicos da ferramenta dentro de seu contexto esperado de utilização, então devem ser atendidas por qualquer versão da ferramenta, inclusive um MVP.', linked: true },
            { id: this.generateSegmentId(), text: ' RNF8', linked: true },
            { id: this.generateSegmentId(), text: 'é um requisito legal que precisa ser atendido por qualquer sistema web.', linked: true },
            { id: this.generateSegmentId(), text: 'Desejáveis:', linked: true },
            { id: this.generateSegmentId(), text: ' RNF2', linked: true },
            { id: this.generateSegmentId(), text: 'é relativo a intuitividade, o que é importante para a utilidade efetiva no contexto esperado de utilização, mas não torna a ferramenta inútil em todos os contextos se não atendido.', linked: true },
            { id: this.generateSegmentId(), text: ' RNF3', linked: true },
            { id: this.generateSegmentId(), text: ' requer que', linked: true },
            { id: this.generateSegmentId(), text: ' RF4', linked: true },
            { id: this.generateSegmentId(), text: ' e/ou', linked: true },
            { id: this.generateSegmentId(), text: ' RF6', linked: true },
            { id: this.generateSegmentId(), text: ', não essenciais, sejam atendidos, mas é de grande importância para o', linked: true },
            { id: this.generateSegmentId(), text: ' RNF6', linked: true },
            { id: this.generateSegmentId(), text: 'quando forem.', linked: true },
            { id: this.generateSegmentId(), text: ' RNF4', linked: true },
            { id: this.generateSegmentId(), text: 'é importante para a utilização da ferramenta no contexto esperado, mas não é estritamente essencial.', linked: true },
            { id: this.generateSegmentId(), text: ' RNF10', linked: true },
            { id: this.generateSegmentId(), text: 'possui relevância política no contexto de controle e governança sobre o software livre e deverá ser atendido em qualquer versão não MVP da ferramenta, mas não é essencial para sua utilidade.', linked: true },
            { id: this.generateSegmentId(), text: ' RNF11', linked: true },
            { id: this.generateSegmentId(), text: 'é importante para assegurar a longevidade da ferramenta e deve-se tentar atingi-lo desde o início para evitar um excesso de dívida técnica, mas não é estritamente essencial.', linked: false },
            { id: this.generateSegmentId(), text: 'Futuros:', linked: true },
            { id: this.generateSegmentId(), text: ' RNF9', linked: true },
            { id: this.generateSegmentId(), text: 'requer a adoção de expressivo esforço para assegurar a plenitude da acessibilidade. Deve-se tentar atender aos requisitos do nível de conformidade AAA da NBR 17225 e implementar medidas adicionais sempre que possível durante o desenvolvimento. Porém, devido aos desafios substanciais em se atender ao nível de conformidade AAA e a dificuldade de se determinar meios adicionais de acessibilidade fora das boas práticas da indústria, atender a este requisito plenamente deverá ser um esforço não imediato.', linked: false }
            
        ]);
    }

    // STUB: Attempt to recover existing segments for a new media file. For now, this method does nothing and is a
    // placeholder for future implementation.
    public recoverSegmentsForNewMediaFile(): void {
        return;
    }

    public toggleSegmentLinked(segment: TextSegment): void {
        const segments = this.segments();
        const segmentIndex = segments.findIndex(s => s.id === segment.id);
        if (segmentIndex !== -1) {
            const updatedSegment = { ...segments[segmentIndex], linked: !segments[segmentIndex].linked };
            const updatedSegments = [...segments];
            updatedSegments[segmentIndex] = updatedSegment;
            this.segments.set(updatedSegments);
        }
    }

    private generateSegmentId(): string {
        return `segment-${this.segments().length + 1}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    }
}

export interface TextSegment {
    id: string;
    text: string;
    linked: boolean;
}
